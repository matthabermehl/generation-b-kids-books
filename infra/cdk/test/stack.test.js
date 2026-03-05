import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
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
    template.resourceCountIs("AWS::SQS::Queue", 2);
    template.resourceCountIs("AWS::CloudWatch::Alarm", 6);
    template.resourceCountIs("AWS::Events::Rule", 1);
    template.hasOutput("BookBuildStateMachineArn", {});
    template.hasOutput("ApiUrl", {});
    expect(template.findResources("AWS::KMS::Key")).toBeTruthy();
  });
});
