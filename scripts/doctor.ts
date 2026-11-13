import { listEngines } from "../server/agents.ts";
import { probeMediaDependencies } from "../server/media.ts";
console.log(`Node ${process.versions.node}`);
for (const engine of await listEngines())
  console.log(
    `${engine.available ? "OK" : "MISSING"} ${engine.label}${engine.reason ? `: ${engine.reason}` : ""}`,
  );
for (const dependency of await probeMediaDependencies())
  console.log(
    `${dependency.available ? "OK" : "MISSING"} ${dependency.name}${dependency.available ? "" : `: ${dependency.hint}`}`,
  );
