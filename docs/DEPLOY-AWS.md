# Deploying to AWS

`npm run deploy` creates the HTTP API and the `api` Lambda function with CloudFormation. Each stage (`dev`, `prod`, or your own) is a separate copy with its own URL. There's no database: the function answers from mock data in memory (see [ARCHITECTURE.md](ARCHITECTURE.md#mock-data-and-what-in-memory-means)).

## 1. Once per machine: AWS credentials

Install the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html), then sign in with a profile that can deploy CloudFormation stacks:

```bash
aws configure --profile inventory      # or: aws configure sso
export AWS_PROFILE=inventory           # PowerShell: $env:AWS_PROFILE = "inventory"
```

## 2. Deploy

Settings come from `backend/.env`, the same file `npm run dev` uses (`useDotenv: true` in `serverless.yml`). `API_KEY` is required, and the deploy stops if it's missing:

```bash
cd backend
npm run deploy            # stage dev
npm run deploy:prod       # stage prod
```

- **A different key per stage:** put it in `backend/.env.prod` (or `.env.dev`). Serverless reads `.env.<stage>` instead of `.env` when that file exists.
- **A one-off override:** a variable already set in your shell wins over the file. In PowerShell, use `$env:API_KEY = "..."`.

The deploy prints `ApiUrl`, the URL Make uses. `npm run info` shows it again.

You'll see `Warning: Invalid configuration encountered at 'provider.runtime'`. That's expected: Serverless v3 predates the `nodejs22.x` runtime in its schema, but AWS accepts it.

The API key ends up as a plain environment variable on the function, visible in the Lambda console. That's fine for mock data. Before the API holds anything real, move it to SSM Parameter Store as a SecureString.

## Logs

```bash
npm run logs
```

Errors behind a 500 response, and webhook deliveries Make didn't accept, are logged there.

## What "in memory" means once deployed

Each Lambda container keeps its own copy of the mock data. Changes survive while the container stays warm (usually several minutes between requests). A cold start, or a second container during a burst of requests, starts from the mock data again. Hooks that the Make custom app registers live in memory too, so after a cold start, turn the Make scenario off and on to register it again. `WEBHOOK_URL` doesn't have this problem.

## Removing a stage

```bash
npx serverless remove --stage dev
```

## Cost

At demo volume this is free or close to it. Lambda's always-free tier covers 1M requests a month, and HTTP API requests cost about $1 per million. Check current prices: [Lambda](https://aws.amazon.com/lambda/pricing/), [API Gateway](https://aws.amazon.com/api-gateway/pricing/).
