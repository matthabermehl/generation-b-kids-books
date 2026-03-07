import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { AiChildrensBookDevStack } from "../lib/book-stack.js";

describe("AiChildrensBookDevStack", () => {
  it("includes key resources", () => {
    const app = new cdk.App();
    const stack = new AiChildrensBookDevStack(app, "TestStack", {
      env: { account: "111111111111", region: "us-east-1" }
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs("AWS::StepFunctions::StateMachine", 1);
    template.resourceCountIs("AWS::ApiGatewayV2::Api", 1);
    template.resourceCountIs("AWS::RDS::DBCluster", 1);
    template.resourceCountIs("AWS::ECS::Cluster", 1);
    template.resourceCountIs("AWS::DynamoDB::Table", 1);
    template.resourceCountIs("AWS::SQS::Queue", 4);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 10);
    template.resourceCountIs("AWS::Events::Rule", 2);
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      BatchSize: 1,
      FunctionName: {
        Ref: Match.stringLikeRegexp("^ImageWorkerFunction")
      }
    });
    template.hasOutput("BookBuildStateMachineArn", {});
    template.hasOutput("ApiUrl", {});
    template.hasOutput("PrivacyPurgeQueueUrl", {});
    expect(template.findResources("AWS::KMS::Key")).toBeTruthy();

    const migrationResource = Object.values(template.findResources("AWS::CloudFormation::CustomResource")).find(
      (resource) => "MigrationVersion" in (resource.Properties ?? {})
    );
    expect(migrationResource).toBeTruthy();
    expect(migrationResource?.Properties?.MigrationVersion).not.toBe("migrations-v3");
  });
});
