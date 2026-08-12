import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function confirm(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${prompt} Type YES to confirm: `);
  rl.close();
  return answer.trim() === "YES";
}
