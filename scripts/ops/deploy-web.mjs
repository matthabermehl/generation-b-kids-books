import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const stackName = process.env.STACK_NAME ?? "AiChildrensBookDevStack";
const awsRegion = process.env.AWS_REGION ?? "us-east-1";
const awsProfile = process.env.AWS_PROFILE;

function withAwsArgs(args) {
  return awsProfile ? [...args, "--profile", awsProfile] : args;
}

function run(command, args, env = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      AWS_REGION: awsRegion,
      ...env
    }
  });
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      AWS_REGION: awsRegion
    }
  }).trim();
}

function resolveResourceId(logicalIdPrefix, resourceType) {
  const value = capture(
    "aws",
    withAwsArgs([
      "cloudformation",
      "list-stack-resources",
      "--stack-name",
      stackName,
      "--query",
      `StackResourceSummaries[?starts_with(LogicalResourceId, '${logicalIdPrefix}') && ResourceType=='${resourceType}'].PhysicalResourceId | [0]`,
      "--output",
      "json"
    ])
  );
  return JSON.parse(value) ?? "";
}

let outputs = {};
try {
  const outputJson = capture(
    "aws",
    withAwsArgs([
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackName,
      "--query",
      "Stacks[0].Outputs",
      "--output",
      "json"
    ])
  );
  outputs = Object.fromEntries(JSON.parse(outputJson).map((entry) => [entry.OutputKey, entry.OutputValue]));
} catch {
  outputs = {};
}

const apiGatewayId = outputs.ApiUrl ? null : resolveResourceId("ControlPlaneApi", "AWS::ApiGatewayV2::Api");
const apiUrl = outputs.ApiUrl ?? `https://${apiGatewayId}.execute-api.${awsRegion}.amazonaws.com`;
const webBucketName = outputs.WebBucketName ?? resolveResourceId("WebBucket", "AWS::S3::Bucket");
const webDistributionId =
  outputs.WebDistributionId ?? resolveResourceId("WebDistribution", "AWS::CloudFront::Distribution");

if (!apiUrl || !webBucketName || !webDistributionId) {
  throw new Error(
    `Missing required stack outputs for web deploy. ApiUrl=${apiUrl ?? "unset"} WebBucketName=${webBucketName ?? "unset"} WebDistributionId=${webDistributionId ?? "unset"}`
  );
}

run("pnpm", ["--filter", "@book/web", "build"], {
  VITE_API_BASE_URL: apiUrl
});

run(
  "aws",
  withAwsArgs([
    "s3",
    "sync",
    "apps/web/dist/",
    `s3://${webBucketName}/`,
    "--delete",
    "--exclude",
    "index.html",
    "--cache-control",
    "public,max-age=31536000,immutable"
  ])
);

run(
  "aws",
  withAwsArgs([
    "s3",
    "cp",
    "apps/web/dist/index.html",
    `s3://${webBucketName}/index.html`,
    "--cache-control",
    "no-cache,no-store,must-revalidate",
    "--content-type",
    "text/html; charset=utf-8"
  ])
);

run(
  "aws",
  withAwsArgs([
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    webDistributionId,
    "--paths",
    "/*"
  ])
);
