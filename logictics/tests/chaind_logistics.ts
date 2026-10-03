import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { expect } from "chai";
import * as crypto from "crypto";
import { ChaindLogistics } from "../target/types/chaind_logistics";

const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = anchor.web3;
type PublicKeyT = InstanceType<typeof PublicKey>;
type KeypairT = InstanceType<typeof Keypair>;

// Layout: slot(8) + epoch_start_timestamp(8) + epoch(8) + leader_schedule_epoch(8) + unix_timestamp(8).
const CLOCK_SYSVAR_ID = new PublicKey(
  "SysvarC1ock11111111111111111111111111111111"
);

describe("chaind_logistics", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.chaindLogistics as Program<ChaindLogistics>;

  const AGREEMENT_SEED = Buffer.from("agreement");
  const ORDER_SEED = Buffer.from("order");
  const MIN_DELIVERY_TIMEOUT = 1;
  const MAX_DELIVERY_TIMEOUT = 90 * 24 * 60 * 60;

  const DEFAULT_FULFILLMENT = 1_000_000; // lamports
  const DEFAULT_SHIPMENT = 500_000; // lamports
  const DEFAULT_TOTAL = DEFAULT_FULFILLMENT + DEFAULT_SHIPMENT;

  // --- helpers -------------------------------------------------------

  async function airdrop(pubkey: PublicKeyT, sol = 2) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL
    );
    const latest = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction(
      { signature: sig, ...latest },
      "confirmed"
    );
  }

  function agreementPda(providerKey: PublicKeyT, clientKey: PublicKeyT) {
    return PublicKey.findProgramAddressSync(
      [AGREEMENT_SEED, providerKey.toBuffer(), clientKey.toBuffer()],
      program.programId
    )[0];
  }

  function orderPda(agreement: PublicKeyT, orderId: number) {
    const idBuf = new anchor.BN(orderId).toArrayLike(Buffer, "le", 8);
    return PublicKey.findProgramAddressSync(
      [ORDER_SEED, agreement.toBuffer(), idBuf],
      program.programId
    )[0];
  }

  function invoiceHash(label = "invoice") {
    return Array.from(
      crypto.createHash("sha256").update(Buffer.from(label)).digest()
    );
  }

  async function balanceOf(pubkey: PublicKeyT) {
    return provider.connection.getBalance(pubkey, "confirmed");
  }

  interface Parties {
    providerKp: KeypairT;
    clientKp: KeypairT;
    courierKp: KeypairT;
    agreement: PublicKeyT;
  }

  /** Fresh, funded provider/client/courier keypairs. No agreement yet. */
  async function freshParties(): Promise<Omit<Parties, "agreement">> {
    const providerKp = Keypair.generate();
    const clientKp = Keypair.generate();
    const courierKp = Keypair.generate();
    await Promise.all([
      airdrop(providerKp.publicKey),
      airdrop(clientKp.publicKey),
      airdrop(courierKp.publicKey),
    ]);
    return { providerKp, clientKp, courierKp };
  }

  async function initAgreement(
    providerKp: KeypairT,
    clientKey: PublicKeyT,
    courierKey: PublicKeyT,
    timeoutSeconds: number
  ) {
    const agreement = agreementPda(providerKp.publicKey, clientKey);
    await program.methods
      .initAgreement(courierKey, new anchor.BN(timeoutSeconds))
      .accounts({
        provider: providerKp.publicKey,
        client: clientKey,
        agreement,
        systemProgram: SystemProgram.programId,
      })
      .signers([providerKp])
      .rpc();
    return agreement;
  }

  async function acceptAgreement(clientKp: KeypairT, agreement: PublicKeyT) {
    await program.methods
      .acceptAgreement()
      .accounts({ client: clientKp.publicKey, agreement })
      .signers([clientKp])
      .rpc();
  }

  /** Fresh parties with an already-accepted agreement. */
  async function setupAcceptedAgreement(
    timeoutSeconds = 3600
  ): Promise<Parties> {
    const { providerKp, clientKp, courierKp } = await freshParties();
    const agreement = await initAgreement(
      providerKp,
      clientKp.publicKey,
      courierKp.publicKey,
      timeoutSeconds
    );
    await acceptAgreement(clientKp, agreement);
    return { providerKp, clientKp, courierKp, agreement };
  }

  async function createOrder(parties: Parties, orderId: number) {
    const order = orderPda(parties.agreement, orderId);
    await program.methods
      .createOrder(new anchor.BN(orderId))
      .accounts({
        provider: parties.providerKp.publicKey,
        agreement: parties.agreement,
        order,
        systemProgram: SystemProgram.programId,
      })
      .signers([parties.providerKp])
      .rpc();
    return order;
  }

  async function setPrices(
    parties: Parties,
    order: PublicKeyT,
    fulfillment = DEFAULT_FULFILLMENT,
    shipment = DEFAULT_SHIPMENT
  ) {
    await program.methods
      .setFulfillmentPrice(new anchor.BN(fulfillment))
      .accounts({
        provider: parties.providerKp.publicKey,
        agreement: parties.agreement,
        order,
      })
      .signers([parties.providerKp])
      .rpc();
    await program.methods
      .setShipmentPrice(new anchor.BN(shipment))
      .accounts({
        provider: parties.providerKp.publicKey,
        agreement: parties.agreement,
        order,
      })
      .signers([parties.providerKp])
      .rpc();
  }

  async function markProcessed(parties: Parties, order: PublicKeyT) {
    await program.methods
      .markProcessed()
      .accounts({
        provider: parties.providerKp.publicKey,
        agreement: parties.agreement,
        order,
      })
      .signers([parties.providerKp])
      .rpc();
  }

  async function payOrder(
    parties: Parties,
    order: PublicKeyT,
    total = DEFAULT_TOTAL
  ) {
    await program.methods
      .pay(new anchor.BN(total))
      .accounts({
        client: parties.clientKp.publicKey,
        agreement: parties.agreement,
        order,
        systemProgram: SystemProgram.programId,
      })
      .signers([parties.clientKp])
      .rpc();
  }

  async function sendInvoice(
    parties: Parties,
    order: PublicKeyT,
    hash = invoiceHash()
  ) {
    await program.methods
      .sendInvoice(hash)
      .accounts({
        provider: parties.providerKp.publicKey,
        agreement: parties.agreement,
        order,
      })
      .signers([parties.providerKp])
      .rpc();
  }

  /** Creates an order and drives it to the given stage with default prices. */
  async function orderAtStage(
    parties: Parties,
    orderId: number,
    stage: "created" | "priced" | "processed" | "paid" | "invoiced"
  ) {
    const order = await createOrder(parties, orderId);
    if (stage === "created") return order;
    await setPrices(parties, order);
    if (stage === "priced") return order;
    await markProcessed(parties, order);
    if (stage === "processed") return order;
    await payOrder(parties, order);
    if (stage === "paid") return order;
    await sendInvoice(parties, order);
    return order;
  }

  function statusName(status: Record<string, unknown>) {
    return Object.keys(status)[0];
  }

  async function assertFails(p: Promise<unknown>, context: string) {
    try {
      await p;
      throw new Error(`expected "${context}" to fail but it succeeded`);
    } catch (err: any) {
      if (err instanceof Error && err.message.startsWith('expected "'))
        throw err;
    }
  }

  async function assertFailsWith(p: Promise<unknown>, code: string) {
    try {
      await p;
      throw new Error(
        `expected transaction to fail with ${code} but it succeeded`
      );
    } catch (err: any) {
      if (
        err instanceof Error &&
        err.message.startsWith("expected transaction")
      )
        throw err;
      const actual = err?.error?.errorCode?.code;
      expect(
        actual,
        `expected error code ${code}, got: ${JSON.stringify(err?.error ?? err)}`
      ).to.equal(code);
    }
  }

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * The validator's on-chain clock does not track wall-clock time closely
   * (it only advances with slots), so a fixed `sleep()` is not a reliable
   * way to wait out a delivery timeout. Poll the real Clock sysvar instead.
   */
  async function onChainUnixTimestamp(): Promise<number> {
    const info = await provider.connection.getAccountInfo(
      CLOCK_SYSVAR_ID,
      "confirmed"
    );
    if (!info) throw new Error("Clock sysvar account not found");
    return Number(info.data.readBigInt64LE(32));
  }

  /**
   * Some local validators (Surfpool included) only advance slots — and so
   * the Clock sysvar — when there is transaction activity, rather than on a
   * real-time ticker. Submitting a trivial, harmless self-transfer nudges
   * the chain forward while we wait out a delivery timeout.
   */
  async function nudgeChainForward() {
    const tx = new anchor.web3.Transaction().add(
      SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: provider.wallet.publicKey,
        lamports: 1,
      })
    );
    await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
  }

  async function waitUntilOnChainTimePast(
    targetUnixTimestamp: number,
    { pollMs = 500, maxWaitMs = 30_000 } = {}
  ) {
    const start = Date.now();
    let lastLog = 0;
    for (;;) {
      const now = await onChainUnixTimestamp();
      if (now >= targetUnixTimestamp) return;

      const elapsed = Date.now() - start;
      if (elapsed - lastLog > 5_000) {
        lastLog = elapsed;
        console.log(
          `    ...waiting for on-chain clock: now=${now} target=${targetUnixTimestamp} (${Math.round(
            elapsed / 1000
          )}s elapsed)`
        );
      }
      if (elapsed > maxWaitMs) {
        throw new Error(
          `on-chain clock stuck at ${now}, did not pass ${targetUnixTimestamp} within ${maxWaitMs}ms`
        );
      }

      await nudgeChainForward();
      await sleep(pollMs);
    }
  }

  /** Waits until `order`'s delivery deadline (paid_at + timeout) has passed on-chain. */
  async function waitForDeliveryDeadline(parties: Parties, order: PublicKeyT) {
    const [orderAccount, agreementAccount] = await Promise.all([
      program.account.order.fetch(order),
      program.account.agreement.fetch(parties.agreement),
    ]);
    const deadline =
      orderAccount.paidAt.toNumber() +
      agreementAccount.deliveryTimeout.toNumber();
    await waitUntilOnChainTimePast(deadline + 1);
  }

  // --- init_agreement --------------------------------------------------

  describe("init_agreement", () => {
    it("happy path reads back all fields", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();
      const agreement = await initAgreement(
        providerKp,
        clientKp.publicKey,
        courierKp.publicKey,
        3600
      );

      const account = await program.account.agreement.fetch(agreement);
      expect(account.provider.equals(providerKp.publicKey)).to.be.true;
      expect(account.client.equals(clientKp.publicKey)).to.be.true;
      expect(account.courier.equals(courierKp.publicKey)).to.be.true;
      expect(account.deliveryTimeout.toNumber()).to.equal(3600);
      expect(account.accepted).to.be.false;
      expect(account.nextOrderId.toNumber()).to.equal(0);
    });

    it("rejects a timeout outside [1s, 90d]", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();

      await assertFailsWith(
        initAgreement(
          providerKp,
          clientKp.publicKey,
          courierKp.publicKey,
          MIN_DELIVERY_TIMEOUT - 1
        ),
        "InvalidTimeout"
      );

      const {
        providerKp: p2,
        clientKp: c2,
        courierKp: k2,
      } = await freshParties();
      await assertFailsWith(
        initAgreement(p2, c2.publicKey, k2.publicKey, MAX_DELIVERY_TIMEOUT + 1),
        "InvalidTimeout"
      );
    });

    it("rejects parties that are not all distinct", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();

      await assertFailsWith(
        initAgreement(
          providerKp,
          providerKp.publicKey,
          courierKp.publicKey,
          3600
        ),
        "PartiesNotDistinct"
      );
      await assertFailsWith(
        initAgreement(providerKp, clientKp.publicKey, clientKp.publicKey, 3600),
        "PartiesNotDistinct"
      );
      await assertFailsWith(
        initAgreement(
          providerKp,
          clientKp.publicKey,
          providerKp.publicKey,
          3600
        ),
        "PartiesNotDistinct"
      );
    });

    it("rejects a second init for the same (provider, client) pair", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();
      await initAgreement(
        providerKp,
        clientKp.publicKey,
        courierKp.publicKey,
        3600
      );

      await assertFails(
        initAgreement(
          providerKp,
          clientKp.publicKey,
          courierKp.publicKey,
          3600
        ),
        "duplicate init_agreement"
      );
    });
  });

  // --- accept_agreement --------------------------------------------------

  describe("accept_agreement", () => {
    it("lets the client accept", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();
      const agreement = await initAgreement(
        providerKp,
        clientKp.publicKey,
        courierKp.publicKey,
        3600
      );

      await acceptAgreement(clientKp, agreement);

      const account = await program.account.agreement.fetch(agreement);
      expect(account.accepted).to.be.true;
    });

    it("rejects the 3PL trying to accept its own agreement", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();
      const agreement = await initAgreement(
        providerKp,
        clientKp.publicKey,
        courierKp.publicKey,
        3600
      );

      await assertFails(
        program.methods
          .acceptAgreement()
          .accounts({ client: providerKp.publicKey, agreement })
          .signers([providerKp])
          .rpc(),
        "3PL accepting its own agreement"
      );
    });

    it("rejects accepting twice", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();
      const agreement = await initAgreement(
        providerKp,
        clientKp.publicKey,
        courierKp.publicKey,
        3600
      );
      await acceptAgreement(clientKp, agreement);

      await assertFailsWith(
        acceptAgreement(clientKp, agreement),
        "AlreadyAccepted"
      );
    });
  });

  // --- create_order --------------------------------------------------

  describe("create_order", () => {
    it("creates order 0 then order 1", async () => {
      const parties = await setupAcceptedAgreement();

      const order0 = await createOrder(parties, 0);
      const account0 = await program.account.order.fetch(order0);
      expect(account0.orderId.toNumber()).to.equal(0);
      expect(statusName(account0.status)).to.equal("created");

      const order1 = await createOrder(parties, 1);
      const account1 = await program.account.order.fetch(order1);
      expect(account1.orderId.toNumber()).to.equal(1);

      const agreementAccount = await program.account.agreement.fetch(
        parties.agreement
      );
      expect(agreementAccount.nextOrderId.toNumber()).to.equal(2);
    });

    it("rejects an order id that is not the next id", async () => {
      const parties = await setupAcceptedAgreement();
      await assertFailsWith(
        program.methods
          .createOrder(new anchor.BN(1))
          .accounts({
            provider: parties.providerKp.publicKey,
            agreement: parties.agreement,
            order: orderPda(parties.agreement, 1),
            systemProgram: SystemProgram.programId,
          })
          .signers([parties.providerKp])
          .rpc(),
        "WrongOrderId"
      );
    });

    it("rejects creating an order before the agreement is accepted", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();
      const agreement = await initAgreement(
        providerKp,
        clientKp.publicKey,
        courierKp.publicKey,
        3600
      );

      await assertFailsWith(
        program.methods
          .createOrder(new anchor.BN(0))
          .accounts({
            provider: providerKp.publicKey,
            agreement,
            order: orderPda(agreement, 0),
            systemProgram: SystemProgram.programId,
          })
          .signers([providerKp])
          .rpc(),
        "AgreementNotAccepted"
      );
    });

    it("rejects the client trying to create an order", async () => {
      const parties = await setupAcceptedAgreement();

      await assertFails(
        program.methods
          .createOrder(new anchor.BN(0))
          .accounts({
            provider: parties.clientKp.publicKey,
            agreement: parties.agreement,
            order: orderPda(parties.agreement, 0),
            systemProgram: SystemProgram.programId,
          })
          .signers([parties.clientKp])
          .rpc(),
        "client creating an order"
      );
    });
  });

  // --- set_fulfillment_price / set_shipment_price --------------------

  describe("set_fulfillment_price / set_shipment_price", () => {
    it("stores both prices", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await createOrder(parties, 0);

      await setPrices(parties, order, 7_000_000, 3_000_000);

      const account = await program.account.order.fetch(order);
      expect(account.fulfillmentPrice.toNumber()).to.equal(7_000_000);
      expect(account.shipmentPrice.toNumber()).to.equal(3_000_000);
    });

    it("rejects the client trying to set a price", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await createOrder(parties, 0);

      await assertFails(
        program.methods
          .setFulfillmentPrice(new anchor.BN(1))
          .accounts({
            provider: parties.clientKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.clientKp])
          .rpc(),
        "client setting a price"
      );
    });

    it("rejects setting a price after the order is Processed", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "processed");

      await assertFailsWith(
        program.methods
          .setShipmentPrice(new anchor.BN(1))
          .accounts({
            provider: parties.providerKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.providerKp])
          .rpc(),
        "InvalidTransition"
      );
    });
  });

  // --- mark_processed --------------------------------------------------

  describe("mark_processed", () => {
    it("moves the order to Processed", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "priced");

      await markProcessed(parties, order);

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("processed");
    });

    it("rejects marking processed without prices set", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await createOrder(parties, 0);

      await assertFailsWith(markProcessed(parties, order), "PriceNotSet");
    });

    it("rejects marking processed twice", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "processed");

      await assertFailsWith(markProcessed(parties, order), "InvalidTransition");
    });
  });

  // --- pay --------------------------------------------------

  describe("pay", () => {
    it("moves exactly the total into escrow", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "processed");

      const orderBefore = await balanceOf(order);
      const clientBefore = await balanceOf(parties.clientKp.publicKey);

      await payOrder(parties, order);

      const orderAfter = await balanceOf(order);
      const clientAfter = await balanceOf(parties.clientKp.publicKey);

      expect(orderAfter - orderBefore).to.equal(DEFAULT_TOTAL);
      expect(clientBefore - clientAfter).to.equal(DEFAULT_TOTAL);

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("paid");
      expect(account.paidAt.toNumber()).to.be.greaterThan(0);
    });

    it("rejects a mismatched expected_total", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "processed");

      await assertFailsWith(
        payOrder(parties, order, DEFAULT_TOTAL - 1),
        "TotalMismatch"
      );
    });

    it("rejects paying twice", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "paid");

      await assertFailsWith(payOrder(parties, order), "InvalidTransition");
    });

    it("rejects the 3PL trying to pay", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "processed");

      await assertFails(
        program.methods
          .pay(new anchor.BN(DEFAULT_TOTAL))
          .accounts({
            client: parties.providerKp.publicKey,
            agreement: parties.agreement,
            order,
            systemProgram: SystemProgram.programId,
          })
          .signers([parties.providerKp])
          .rpc(),
        "3PL paying"
      );
    });
  });

  // --- send_invoice --------------------------------------------------

  describe("send_invoice", () => {
    it("stores the invoice hash", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "paid");
      const hash = invoiceHash("devnet-invoice-1");

      await sendInvoice(parties, order, hash);

      const account = await program.account.order.fetch(order);
      expect(Array.from(account.invoiceHash as Uint8Array)).to.deep.equal(hash);
      expect(statusName(account.status)).to.equal("invoiced");
    });

    it("rejects sending an invoice before payment", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "processed");

      await assertFailsWith(sendInvoice(parties, order), "InvalidTransition");
    });
  });

  // --- confirm_delivery --------------------------------------------------

  describe("confirm_delivery", () => {
    it("pays the exact fulfillment and shipment fees", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "invoiced");

      const orderBefore = await balanceOf(order);
      const providerBefore = await balanceOf(parties.providerKp.publicKey);
      const courierBefore = await balanceOf(parties.courierKp.publicKey);

      await program.methods
        .confirmDelivery()
        .accounts({
          courier: parties.courierKp.publicKey,
          provider: parties.providerKp.publicKey,
          agreement: parties.agreement,
          order,
        })
        .signers([parties.courierKp])
        .rpc();

      const orderAfter = await balanceOf(order);
      const providerAfter = await balanceOf(parties.providerKp.publicKey);
      const courierAfter = await balanceOf(parties.courierKp.publicKey);

      expect(orderBefore - orderAfter).to.equal(DEFAULT_TOTAL);
      expect(providerAfter - providerBefore).to.equal(DEFAULT_FULFILLMENT);
      expect(courierAfter - courierBefore).to.equal(DEFAULT_SHIPMENT);

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("closed");
    });

    it("rejects the client or the 3PL trying to confirm", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "invoiced");

      await assertFails(
        program.methods
          .confirmDelivery()
          .accounts({
            courier: parties.clientKp.publicKey,
            provider: parties.providerKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.clientKp])
          .rpc(),
        "client confirming delivery"
      );

      await assertFails(
        program.methods
          .confirmDelivery()
          .accounts({
            courier: parties.providerKp.publicKey,
            provider: parties.providerKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.providerKp])
          .rpc(),
        "3PL confirming delivery"
      );
    });

    it("rejects confirming before the invoice is sent", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "paid");

      await assertFailsWith(
        program.methods
          .confirmDelivery()
          .accounts({
            courier: parties.courierKp.publicKey,
            provider: parties.providerKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.courierKp])
          .rpc(),
        "InvalidTransition"
      );
    });

    it("rejects a provider account that does not match the agreement", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "invoiced");
      const wrongProvider = Keypair.generate().publicKey;

      await assertFails(
        program.methods
          .confirmDelivery()
          .accounts({
            courier: parties.courierKp.publicKey,
            provider: wrongProvider,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.courierKp])
          .rpc(),
        "wrong provider account"
      );
    });
  });

  // --- cancel_order --------------------------------------------------

  describe("cancel_order", () => {
    it("lets the 3PL cancel", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "created");

      await program.methods
        .cancelOrder()
        .accounts({
          signer: parties.providerKp.publicKey,
          agreement: parties.agreement,
          order,
        })
        .signers([parties.providerKp])
        .rpc();

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("cancelled");
    });

    it("lets the client cancel", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "processed");

      await program.methods
        .cancelOrder()
        .accounts({
          signer: parties.clientKp.publicKey,
          agreement: parties.agreement,
          order,
        })
        .signers([parties.clientKp])
        .rpc();

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("cancelled");
    });

    it("rejects the courier trying to cancel", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "created");

      await assertFailsWith(
        program.methods
          .cancelOrder()
          .accounts({
            signer: parties.courierKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.courierKp])
          .rpc(),
        "NotAParty"
      );
    });

    it("rejects cancelling once the order is Paid", async () => {
      const parties = await setupAcceptedAgreement();
      const order = await orderAtStage(parties, 0, "paid");

      await assertFailsWith(
        program.methods
          .cancelOrder()
          .accounts({
            signer: parties.clientKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.clientKp])
          .rpc(),
        "InvalidTransition"
      );
    });
  });

  // --- refund_expired --------------------------------------------------

  describe("refund_expired", () => {
    it("rejects a refund before the deadline passes", async () => {
      const parties = await setupAcceptedAgreement(3600);
      const order = await orderAtStage(parties, 0, "paid");

      await assertFailsWith(
        program.methods
          .refundExpired()
          .accounts({
            client: parties.clientKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.clientKp])
          .rpc(),
        "NotExpired"
      );
    });

    it("refunds the exact total once a short timeout has passed", async () => {
      const parties = await setupAcceptedAgreement(2);
      const order = await orderAtStage(parties, 0, "paid");

      await waitForDeliveryDeadline(parties, order);

      const orderBefore = await balanceOf(order);
      const clientBefore = await balanceOf(parties.clientKp.publicKey);

      await program.methods
        .refundExpired()
        .accounts({
          client: parties.clientKp.publicKey,
          agreement: parties.agreement,
          order,
        })
        .signers([parties.clientKp])
        .rpc();

      const orderAfter = await balanceOf(order);
      const clientAfter = await balanceOf(parties.clientKp.publicKey);

      expect(orderBefore - orderAfter).to.equal(DEFAULT_TOTAL);
      expect(clientAfter - clientBefore).to.equal(DEFAULT_TOTAL);

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("refunded");
    });

    it("also works from Invoiced", async () => {
      const parties = await setupAcceptedAgreement(2);
      const order = await orderAtStage(parties, 0, "invoiced");

      await waitForDeliveryDeadline(parties, order);

      await program.methods
        .refundExpired()
        .accounts({
          client: parties.clientKp.publicKey,
          agreement: parties.agreement,
          order,
        })
        .signers([parties.clientKp])
        .rpc();

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("refunded");
    });

    it("rejects the courier confirming delivery after a refund", async () => {
      const parties = await setupAcceptedAgreement(2);
      const order = await orderAtStage(parties, 0, "invoiced");

      await waitForDeliveryDeadline(parties, order);
      await program.methods
        .refundExpired()
        .accounts({
          client: parties.clientKp.publicKey,
          agreement: parties.agreement,
          order,
        })
        .signers([parties.clientKp])
        .rpc();

      await assertFailsWith(
        program.methods
          .confirmDelivery()
          .accounts({
            courier: parties.courierKp.publicKey,
            provider: parties.providerKp.publicKey,
            agreement: parties.agreement,
            order,
          })
          .signers([parties.courierKp])
          .rpc(),
        "InvalidTransition"
      );
    });
  });

  // --- full happy path --------------------------------------------------

  describe("full happy path", () => {
    it("walks agreement -> order -> Closed and settles all three balances", async () => {
      const { providerKp, clientKp, courierKp } = await freshParties();
      const agreement = await initAgreement(
        providerKp,
        clientKp.publicKey,
        courierKp.publicKey,
        3600
      );
      await acceptAgreement(clientKp, agreement);
      const parties: Parties = { providerKp, clientKp, courierKp, agreement };

      const order = await createOrder(parties, 0);
      await setPrices(parties, order, DEFAULT_FULFILLMENT, DEFAULT_SHIPMENT);
      await markProcessed(parties, order);

      const clientBefore = await balanceOf(clientKp.publicKey);
      await payOrder(parties, order);
      const providerBefore = await balanceOf(providerKp.publicKey);
      const courierBefore = await balanceOf(courierKp.publicKey);

      await sendInvoice(parties, order);

      await program.methods
        .confirmDelivery()
        .accounts({
          courier: courierKp.publicKey,
          provider: providerKp.publicKey,
          agreement,
          order,
        })
        .signers([courierKp])
        .rpc();

      const clientAfter = await balanceOf(clientKp.publicKey);
      const providerAfter = await balanceOf(providerKp.publicKey);
      const courierAfter = await balanceOf(courierKp.publicKey);

      expect(clientBefore - clientAfter).to.equal(DEFAULT_TOTAL);
      expect(providerAfter - providerBefore).to.equal(DEFAULT_FULFILLMENT);
      expect(courierAfter - courierBefore).to.equal(DEFAULT_SHIPMENT);

      const account = await program.account.order.fetch(order);
      expect(statusName(account.status)).to.equal("closed");

      // The order PDA keeps only its own rent-exempt reserve once escrow is settled.
      const orderBalance = await balanceOf(order);
      const rentExempt =
        await provider.connection.getMinimumBalanceForRentExemption(
          (await provider.connection.getAccountInfo(order))!.data.length
        );
      expect(orderBalance).to.equal(rentExempt);
    });
  });
});
