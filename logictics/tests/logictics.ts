import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { Logictics } from "../target/types/logictics";

describe("logictics", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.logictics as Program<Logictics>;

  it("exposes the order flow", async () => {
    console.log("Program id", program.programId.toBase58());
  });
});
