import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), "dist");
mkdirSync(distDir, { recursive: true });

const generatedAt = new Date().toISOString();

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agents Cloud</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #070a12;
        color: #eef3ff;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 20% 20%, rgba(73, 128, 255, 0.2), transparent 28rem),
          radial-gradient(circle at 80% 10%, rgba(51, 214, 159, 0.16), transparent 24rem),
          #070a12;
      }
      main {
        width: min(920px, calc(100vw - 48px));
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 28px;
        padding: 36px;
        background: rgba(11, 16, 29, 0.82);
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.45);
      }
      .eyebrow {
        margin: 0 0 14px;
        color: #8fb3ff;
        text-transform: uppercase;
        letter-spacing: 0.14em;
        font-size: 12px;
        font-weight: 700;
      }
      h1 {
        margin: 0;
        font-size: clamp(38px, 7vw, 76px);
        line-height: 0.94;
        letter-spacing: -0.06em;
      }
      p {
        max-width: 680px;
        color: #b9c4d8;
        font-size: 18px;
        line-height: 1.65;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 12px;
        margin-top: 28px;
      }
      .card {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 18px;
        padding: 18px;
        background: rgba(255, 255, 255, 0.045);
      }
      .card strong {
        display: block;
        color: #ffffff;
        margin-bottom: 6px;
      }
      .card span {
        color: #9ba9c1;
        font-size: 14px;
      }
      code {
        color: #9ff3d0;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Agents Cloud</p>
      <h1>Autonomous agent cloud foundation is online.</h1>
      <p>
        This is the temporary Amplify Hosting placeholder. The deployed backend foundation already includes Cognito Auth,
        DynamoDB state, S3 artifacts, ECS/Fargate runtime, and Step Functions orchestration in <code>us-east-1</code>.
      </p>
      <section class="grid" aria-label="Platform status">
        <div class="card"><strong>Amplify Auth</strong><span>Cognito sandbox deployed.</span></div>
        <div class="card"><strong>CDK Backend</strong><span>Seven dev stacks deployed.</span></div>
        <div class="card"><strong>Next</strong><span>Control API + first real run lifecycle.</span></div>
      </section>
      <p style="font-size: 13px; margin-top: 28px; color: #75839a;">Generated at ${generatedAt}</p>
    </main>
  </body>
</html>
`;

writeFileSync(join(distDir, "index.html"), html);
writeFileSync(
  join(distDir, "status.json"),
  `${JSON.stringify(
    {
      app: "agents-cloud",
      status: "placeholder-hosting-online",
      generatedAt,
      region: "us-east-1",
      next: "Build Control API and connect authenticated frontend."
    },
    null,
    2
  )}\n`
);

console.log(`Amplify placeholder hosting output written to ${distDir}`);
