// CLI for the durability harness.
//   pnpm eval:durability --backend eve|flue|mastra [--scenario N] [--dry]
// Exit code: 0 if no scenario FAILED (blocked is not a failure — it means the
// model key is absent), 1 if any scenario failed.
import { BACKENDS, type BackendName } from "./harness/backends.js";
import { runAndReport } from "./harness/runner.js";

interface Args {
  backend?: BackendName;
  scenario?: number;
  dry: boolean;
  noService: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dry: false, noService: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--backend") args.backend = argv[++i] as BackendName;
    else if (a === "--scenario") args.scenario = Number.parseInt(argv[++i] ?? "", 10);
    else if (a === "--dry") args.dry = true;
    else if (a === "--no-service") args.noService = true;
    else if (a === "--help" || a === "-h") args.backend = undefined;
  }
  return args;
}

const USAGE = `durability harness
  pnpm eval:durability --backend <eve|flue|mastra> [--scenario N] [--dry] [--no-service]

  --backend     which candidate to drive (required)
  --scenario N  run only scenario N (1..8); default: all
  --dry         model-free run: start+health the service, exercise the
                model-free durability scenarios (2,3,7,8) against the repo
  --no-service  do not spawn the backend service (repo-only)

Env: DATABASE_URL (shared Postgres; TRUNCATEd between scenarios),
     OPENROUTER_API_KEY (enables model-driven scenarios 1,4,5,6).`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.backend || !BACKENDS.includes(args.backend)) {
    console.log(USAGE);
    process.exit(args.backend ? 1 : 0);
  }
  const report = await runAndReport({
    backend: args.backend,
    dry: args.dry,
    scenario: args.scenario,
    noService: args.noService,
  });
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
