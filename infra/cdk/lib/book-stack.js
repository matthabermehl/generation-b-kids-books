import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as customResources from "aws-cdk-lib/custom-resources";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecrAssets from "aws-cdk-lib/aws-ecr-assets";
import * as events from "aws-cdk-lib/aws-events";
import * as eventsTargets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3Deploy from "aws-cdk-lib/aws-s3-deployment";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as sfnTasks from "aws-cdk-lib/aws-stepfunctions-tasks";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

function bool(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

export class AiChildrensBookDevStack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const envName = "dev";
    const ssmPrefix = process.env.SSM_PREFIX ?? "/ai-childrens-book/dev";
    const runtimeConfigCacheTtlSeconds = process.env.RUNTIME_CONFIG_CACHE_TTL_SECONDS ?? "300";
    const rendererCpu = Number(process.env.RENDERER_TASK_CPU ?? "1024");
    const rendererMemory = Number(process.env.RENDERER_TASK_MEMORY ?? "2048");

    const encryptionKey = new kms.Key(this, "PlatformKey", {
      enableKeyRotation: true,
      description: "KMS key for AI children's book artifacts and state"
    });

    const webBucket = new s3.Bucket(this, "WebBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true
    });

    const artifactBucket = new s3.Bucket(this, "ArtifactBucket", {
      encryption: s3.BucketEncryption.KMS,
      encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true
    });

    const distribution = new cloudfront.Distribution(this, "WebDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      additionalBehaviors: {
        "artifacts/*": {
          origin: origins.S3BucketOrigin.withOriginAccessControl(artifactBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
        }
      },
      defaultRootObject: "index.html",
      // SPA deep links like /verify must fall back to index.html.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0)
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0)
        }
      ]
    });

    new s3Deploy.BucketDeployment(this, "WebPlaceholderDeploy", {
      destinationBucket: webBucket,
      distribution,
      sources: [s3Deploy.Source.data("index.html", "<html><body><h1>Deploy web bundle to this bucket</h1></body></html>")]
    });

    const idempotencyTable = new dynamodb.Table(this, "IdempotencyTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey
    });

    const queueDlq = new sqs.Queue(this, "ImageQueueDlq", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: encryptionKey,
      retentionPeriod: cdk.Duration.days(14)
    });

    const imageQueue = new sqs.Queue(this, "ImageQueue", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: encryptionKey,
      visibilityTimeout: cdk.Duration.minutes(5),
      deadLetterQueue: {
        queue: queueDlq,
        maxReceiveCount: 3
      }
    });

    const privacyQueueDlq = new sqs.Queue(this, "PrivacyPurgeQueueDlq", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: encryptionKey,
      retentionPeriod: cdk.Duration.days(14)
    });

    const privacyPurgeQueue = new sqs.Queue(this, "PrivacyPurgeQueue", {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: encryptionKey,
      visibilityTimeout: cdk.Duration.minutes(5),
      deadLetterQueue: {
        queue: privacyQueueDlq,
        maxReceiveCount: 3
      }
    });

    const vpc = new ec2.Vpc(this, "AppVpc", {
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
        }
      ]
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      allowAllOutbound: true
    });

    const lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSecurityGroup", {
      vpc,
      allowAllOutbound: true
    });

    dbSecurityGroup.addIngressRule(lambdaSecurityGroup, ec2.Port.tcp(5432));

    const cluster = new rds.DatabaseCluster(this, "BookCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4
      }),
      writer: rds.ClusterInstance.serverlessV2("writer"),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS
      },
      defaultDatabaseName: "bookapp",
      securityGroups: [dbSecurityGroup],
      storageEncrypted: true,
      storageEncryptionKey: encryptionKey,
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      enableDataApi: true,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const commonFunctionEnv = {
      APP_ENV: envName,
      SSM_PREFIX: ssmPrefix,
      RUNTIME_CONFIG_CACHE_TTL_SECONDS: runtimeConfigCacheTtlSeconds,
      ARTIFACT_BUCKET: artifactBucket.bucketName,
      DB_CLUSTER_ARN: cluster.clusterArn,
      DB_SECRET_ARN: cluster.secret?.secretArn ?? "",
      DB_NAME: "bookapp",
      IDEMPOTENCY_TABLE: idempotencyTable.tableName,
      IDEMPOTENCY_TTL_SECONDS: process.env.IDEMPOTENCY_TTL_SECONDS ?? "86400",
      BOOK_DEFAULT_PAGE_COUNT: process.env.BOOK_DEFAULT_PAGE_COUNT ?? "12",
      ENABLE_STRICT_DECODABLE_CHECKS: process.env.ENABLE_STRICT_DECODABLE_CHECKS ?? "true",
      AUTH_LINK_TTL_MINUTES: process.env.AUTH_LINK_TTL_MINUTES ?? "15",
      WEB_BASE_URL: process.env.WEB_BASE_URL ?? `https://${distribution.distributionDomainName}`,
      ORDER_STUCK_MINUTES: process.env.ORDER_STUCK_MINUTES ?? "45"
    };

    const apiFunction = new lambdaNode.NodejsFunction(this, "ApiFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(29),
      memorySize: 1024,
      entry: path.resolve(repoRoot, "apps/api/src/http.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv,
        ARTIFACT_PUBLIC_BASE_URL: `https://${distribution.distributionDomainName}`,
        PRIVACY_PURGE_QUEUE_URL: privacyPurgeQueue.queueUrl
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup]
    });

    const pipelineFunction = new lambdaNode.NodejsFunction(this, "PipelineFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(2),
      memorySize: 1024,
      entry: path.resolve(repoRoot, "apps/workers/src/pipeline.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv,
        IMAGE_QUEUE_URL: imageQueue.queueUrl
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup]
    });

    const imageWorkerFunction = new lambdaNode.NodejsFunction(this, "ImageWorkerFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(2),
      memorySize: 1024,
      entry: path.resolve(repoRoot, "apps/workers/src/image-worker.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup],
      reservedConcurrentExecutions: 20
    });

    const checkImagesFunction = new lambdaNode.NodejsFunction(this, "CheckImagesFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      entry: path.resolve(repoRoot, "apps/workers/src/check-images.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup]
    });

    const finalizeFunction = new lambdaNode.NodejsFunction(this, "FinalizeFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(45),
      memorySize: 512,
      entry: path.resolve(repoRoot, "apps/workers/src/finalize.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup]
    });

    const executionStatusFunction = new lambdaNode.NodejsFunction(this, "ExecutionStatusFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      entry: path.resolve(repoRoot, "apps/workers/src/execution-status.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup]
    });

    const privacyPurgeFunction = new lambdaNode.NodejsFunction(this, "PrivacyPurgeFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      entry: path.resolve(repoRoot, "apps/workers/src/privacy-purge.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup],
      reservedConcurrentExecutions: 10
    });

    const orderHealthFunction = new lambdaNode.NodejsFunction(this, "OrderHealthFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      entry: path.resolve(repoRoot, "apps/workers/src/order-health.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup]
    });

    const migrationFunction = new lambdaNode.NodejsFunction(this, "MigrationFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      entry: path.resolve(repoRoot, "apps/workers/src/migrate.ts"),
      projectRoot: repoRoot,
      depsLockFilePath: path.resolve(repoRoot, "pnpm-lock.yaml"),
      environment: {
        ...commonFunctionEnv
      },
      bundling: {
        externalModules: ["aws-sdk"]
      },
      vpc,
      securityGroups: [lambdaSecurityGroup]
    });

    imageWorkerFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(imageQueue, {
        batchSize: 5,
        reportBatchItemFailures: true
      })
    );

    privacyPurgeFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(privacyPurgeQueue, {
        batchSize: 5,
        reportBatchItemFailures: true
      })
    );

    idempotencyTable.grantReadWriteData(apiFunction);
    cluster.grantDataApiAccess(apiFunction);
    cluster.grantDataApiAccess(pipelineFunction);
    cluster.grantDataApiAccess(imageWorkerFunction);
    cluster.grantDataApiAccess(checkImagesFunction);
    cluster.grantDataApiAccess(finalizeFunction);
    cluster.grantDataApiAccess(executionStatusFunction);
    cluster.grantDataApiAccess(privacyPurgeFunction);
    cluster.grantDataApiAccess(orderHealthFunction);
    cluster.grantDataApiAccess(migrationFunction);

    artifactBucket.grantReadWrite(pipelineFunction);
    artifactBucket.grantReadWrite(imageWorkerFunction);
    artifactBucket.grantReadWrite(finalizeFunction);
    artifactBucket.grantRead(apiFunction);
    artifactBucket.grantDelete(privacyPurgeFunction);

    imageQueue.grantSendMessages(pipelineFunction);
    privacyPurgeQueue.grantSendMessages(apiFunction);

    const runtimeConfigReaders = [
      apiFunction,
      pipelineFunction,
      imageWorkerFunction,
      checkImagesFunction,
      finalizeFunction,
      executionStatusFunction,
      orderHealthFunction
    ];
    const ssmRootArn = `arn:${cdk.Aws.PARTITION}:ssm:${this.region}:${this.account}:parameter${ssmPrefix}`;
    const ssmPathArn = `${ssmRootArn}/*`;
    for (const fn of runtimeConfigReaders) {
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter", "ssm:GetParameters"],
          resources: [ssmRootArn, ssmPathArn]
        })
      );
      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParametersByPath", "ssm:DescribeParameters"],
          resources: ["*"]
        })
      );

      fn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["kms:Decrypt"],
          resources: ["*"],
          conditions: {
            StringEquals: {
              "kms:ViaService": `ssm.${this.region}.amazonaws.com`
            }
          }
        })
      );
    }

    if (cluster.secret) {
      cluster.secret.grantRead(apiFunction);
      cluster.secret.grantRead(pipelineFunction);
      cluster.secret.grantRead(imageWorkerFunction);
      cluster.secret.grantRead(checkImagesFunction);
      cluster.secret.grantRead(finalizeFunction);
      cluster.secret.grantRead(executionStatusFunction);
      cluster.secret.grantRead(privacyPurgeFunction);
      cluster.secret.grantRead(orderHealthFunction);
      cluster.secret.grantRead(migrationFunction);
    }

    new events.Rule(this, "OrderHealthScheduleRule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      targets: [new eventsTargets.LambdaFunction(orderHealthFunction)]
    });

    const rendererCluster = new ecs.Cluster(this, "RendererCluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENHANCED
    });

    const rendererTaskDefinition = new ecs.FargateTaskDefinition(this, "RendererTaskDefinition", {
      cpu: rendererCpu,
      memoryLimitMiB: rendererMemory,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
      }
    });

    const rendererImageAsset = new ecrAssets.DockerImageAsset(this, "RendererImageAsset", {
      directory: path.resolve(repoRoot, "apps/renderer")
    });

    const rendererContainer = rendererTaskDefinition.addContainer("RendererContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(rendererImageAsset),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "renderer" }),
      environment: {
        ARTIFACT_BUCKET: artifactBucket.bucketName
      }
    });

    rendererContainer.addPortMappings({ containerPort: 8080 });

    artifactBucket.grantReadWrite(rendererTaskDefinition.taskRole);

    const rendererService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "RendererService", {
      cluster: rendererCluster,
      taskDefinition: rendererTaskDefinition,
      desiredCount: 1,
      publicLoadBalancer: false
    });

    const configuredCorsOrigins = (
      process.env.WEB_CORS_ORIGINS ?? process.env.WEB_BASE_URL ?? `https://${distribution.distributionDomainName}`
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

    const api = new apigwv2.HttpApi(this, "ControlPlaneApi", {
      createDefaultStage: true,
      corsPreflight: {
        allowHeaders: ["authorization", "content-type", "idempotency-key"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: configuredCorsOrigins
      }
    });

    const apiIntegration = new apigwv2Integrations.HttpLambdaIntegration("ApiIntegration", apiFunction);

    api.addRoutes({ path: "/v1/auth/request-link", methods: [apigwv2.HttpMethod.POST], integration: apiIntegration });
    api.addRoutes({ path: "/v1/auth/verify-link", methods: [apigwv2.HttpMethod.POST], integration: apiIntegration });
    api.addRoutes({ path: "/v1/orders", methods: [apigwv2.HttpMethod.POST], integration: apiIntegration });
    api.addRoutes({
      path: "/v1/orders/{orderId}/checkout",
      methods: [apigwv2.HttpMethod.POST],
      integration: apiIntegration
    });
    api.addRoutes({
      path: "/v1/orders/{orderId}/mark-paid",
      methods: [apigwv2.HttpMethod.POST],
      integration: apiIntegration
    });
    api.addRoutes({
      path: "/v1/webhooks/stripe",
      methods: [apigwv2.HttpMethod.POST],
      integration: apiIntegration
    });
    api.addRoutes({ path: "/v1/orders/{orderId}", methods: [apigwv2.HttpMethod.GET], integration: apiIntegration });
    api.addRoutes({ path: "/v1/books/{bookId}", methods: [apigwv2.HttpMethod.GET], integration: apiIntegration });
    api.addRoutes({
      path: "/v1/books/{bookId}/download",
      methods: [apigwv2.HttpMethod.GET],
      integration: apiIntegration
    });
    api.addRoutes({
      path: "/v1/child-profiles/{childProfileId}",
      methods: [apigwv2.HttpMethod.DELETE],
      integration: apiIntegration
    });

    const prepareStoryTask = new sfnTasks.LambdaInvoke(this, "PrepareStory", {
      lambdaFunction: pipelineFunction,
      payload: sfn.TaskInput.fromObject({
        action: "prepare_story",
        bookId: sfn.JsonPath.stringAt("$.bookId")
      }),
      resultPath: "$.prepareStory"
    });

    const generateCharacterSheetTask = new sfnTasks.LambdaInvoke(this, "GenerateCharacterSheet", {
      lambdaFunction: pipelineFunction,
      payload: sfn.TaskInput.fromObject({
        action: "generate_character_sheet",
        bookId: sfn.JsonPath.stringAt("$.bookId")
      }),
      resultPath: "$.characterSheet"
    });

    const enqueueImagesTask = new sfnTasks.LambdaInvoke(this, "EnqueuePageImages", {
      lambdaFunction: pipelineFunction,
      payload: sfn.TaskInput.fromObject({
        action: "enqueue_page_images",
        bookId: sfn.JsonPath.stringAt("$.bookId")
      }),
      resultPath: "$.enqueueImages"
    });

    const waitForImagesTask = new sfnTasks.LambdaInvoke(this, "CheckImageCompletion", {
      lambdaFunction: checkImagesFunction,
      payload: sfn.TaskInput.fromObject({
        bookId: sfn.JsonPath.stringAt("$.bookId")
      }),
      resultPath: "$.imageStatus"
    });

    const waitForImagesRetryTask = new sfnTasks.LambdaInvoke(this, "CheckImageCompletionRetry", {
      lambdaFunction: checkImagesFunction,
      payload: sfn.TaskInput.fromObject({
        bookId: sfn.JsonPath.stringAt("$.bookId")
      }),
      resultPath: "$.imageStatus"
    });

    const pollWait = new sfn.Wait(this, "WaitBeforeRecheck", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(10))
    });

    const prepareRenderInputTask = new sfnTasks.LambdaInvoke(this, "PrepareRenderInput", {
      lambdaFunction: pipelineFunction,
      payload: sfn.TaskInput.fromObject({
        action: "prepare_render_input",
        bookId: sfn.JsonPath.stringAt("$.bookId")
      }),
      resultPath: "$.prepareRender"
    });

    const renderPdfTask = new sfnTasks.EcsRunTask(this, "RenderPdfInFargate", {
      cluster: rendererCluster,
      taskDefinition: rendererTaskDefinition,
      integrationPattern: sfn.IntegrationPattern.RUN_JOB,
      launchTarget: new sfnTasks.EcsFargateLaunchTarget(),
      containerOverrides: [
        {
          containerDefinition: rendererContainer,
          command: ["node", "dist/cli/render-once.js"],
          environment: [
            {
              name: "ARTIFACT_BUCKET",
              value: artifactBucket.bucketName
            },
            {
              name: "RENDER_INPUT_KEY",
              value: sfn.JsonPath.stringAt("$.prepareRender.Payload.renderInputKey")
            },
            {
              name: "OUTPUT_PDF_KEY",
              value: sfn.JsonPath.stringAt("$.prepareRender.Payload.outputPdfKey")
            }
          ]
        }
      ],
      resultPath: "$.renderTask"
    });

    const finalizeTask = new sfnTasks.LambdaInvoke(this, "FinalizeBook", {
      lambdaFunction: finalizeFunction,
      payload: sfn.TaskInput.fromObject({
        bookId: sfn.JsonPath.stringAt("$.bookId"),
        outputPdfKey: sfn.JsonPath.stringAt("$.prepareRender.Payload.outputPdfKey")
      }),
      resultPath: "$.finalize"
    });

    const imageDoneChoice = new sfn.Choice(this, "AllImagesReady?");
    const imageFailure = new sfn.Fail(this, "ImageGenerationFailed", {
      error: "ImageQAFailed",
      cause: "One or more page images failed QA after retry budget."
    });
    const imageNeedsReviewFailure = new sfn.Fail(this, "ImageNeedsReview", {
      error: "ImageNeedsReview",
      cause: "Image safety policy flagged one or more pages for manual review."
    });

    imageDoneChoice
      .when(
        sfn.Condition.booleanEquals("$.imageStatus.Payload.done", true),
        prepareRenderInputTask.next(renderPdfTask).next(finalizeTask)
      )
      .when(sfn.Condition.booleanEquals("$.imageStatus.Payload.needsReview", true), imageNeedsReviewFailure)
      .when(sfn.Condition.numberGreaterThan("$.imageStatus.Payload.failed", 0), imageFailure)
      .otherwise(pollWait.next(waitForImagesRetryTask).next(imageDoneChoice));

    const definition = prepareStoryTask
      .next(generateCharacterSheetTask)
      .next(enqueueImagesTask)
      .next(waitForImagesTask)
      .next(imageDoneChoice);

    const logGroup = new logs.LogGroup(this, "StateMachineLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const stateMachine = new sfn.StateMachine(this, "BookBuildStateMachine", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(45),
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true
      }
    });

    apiFunction.addEnvironment("BOOK_BUILD_STATE_MACHINE_ARN", stateMachine.stateMachineArn);
    stateMachine.grantStartExecution(apiFunction);
    stateMachine.grantRead(executionStatusFunction);

    const migrationsProvider = new customResources.Provider(this, "MigrationsProvider", {
      onEventHandler: migrationFunction,
      logRetention: logs.RetentionDays.ONE_WEEK
    });

    const migrationsCustomResource = new cdk.CustomResource(this, "RunMigrations", {
      serviceToken: migrationsProvider.serviceToken,
      properties: {
        MigrationVersion: "v3"
      }
    });
    migrationsCustomResource.node.addDependency(cluster);

    const secretSsmParameterPlaceholders = {
      SENDGRID_API_KEY: "SET_ME",
      OPENAI_API_KEY: "SET_ME",
      ANTHROPIC_API_KEY: "SET_ME",
      FAL_KEY: "SET_ME",
      JWT_SIGNING_SECRET: "SET_ME",
      STRIPE_SECRET_KEY: "SET_ME",
      STRIPE_WEBHOOK_SECRET: "SET_ME"
    };

    const standardSsmParameters = {
      SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL ?? "noreply@example.com",
      AUTH_LINK_TTL_MINUTES: process.env.AUTH_LINK_TTL_MINUTES ?? "15",
      WEB_BASE_URL: process.env.WEB_BASE_URL ?? `https://${distribution.distributionDomainName}`,
      OPENAI_MODEL_JSON: process.env.OPENAI_MODEL_JSON ?? "gpt-4.1-mini",
      OPENAI_MODEL_VISION: process.env.OPENAI_MODEL_VISION ?? "gpt-4.1-mini",
      ANTHROPIC_MODEL_WRITER: process.env.ANTHROPIC_MODEL_WRITER ?? "claude-sonnet-4-5",
      FAL_ENDPOINT_BASE: process.env.FAL_ENDPOINT_BASE ?? "fal-ai/flux-2",
      FAL_ENDPOINT_LORA: process.env.FAL_ENDPOINT_LORA ?? "fal-ai/flux-lora",
      FAL_ENDPOINT_GENERAL: process.env.FAL_ENDPOINT_GENERAL ?? "fal-ai/flux-general",
      STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID ?? "price_SET_ME",
      STRIPE_SUCCESS_URL:
        process.env.STRIPE_SUCCESS_URL ?? `https://${distribution.distributionDomainName}/?checkout=success`,
      STRIPE_CANCEL_URL:
        process.env.STRIPE_CANCEL_URL ?? `https://${distribution.distributionDomainName}/?checkout=cancel`,
      ENABLE_MOCK_LLM: process.env.ENABLE_MOCK_LLM ?? "false",
      ENABLE_MOCK_IMAGE: process.env.ENABLE_MOCK_IMAGE ?? "false",
      ENABLE_MOCK_CHECKOUT: process.env.ENABLE_MOCK_CHECKOUT ?? "false"
    };

    // CloudFormation does not support SecureString for AWS::SSM::Parameter.
    // Use scripts/ops/migrate-ssm-params.sh to enforce SecureString typing in-place.
    for (const [key, value] of Object.entries(secretSsmParameterPlaceholders)) {
      new ssm.CfnParameter(this, `Param${key}`, {
        name: `${ssmPrefix}/${key.toLowerCase()}`,
        type: "String",
        value,
        tier: "Standard"
      });
    }

    for (const [key, value] of Object.entries(standardSsmParameters)) {
      new ssm.CfnParameter(this, `ConfigParam${key}`, {
        name: `${ssmPrefix}/${key.toLowerCase()}`,
        type: "String",
        value,
        tier: "Standard"
      });
    }

    const auditLogGroup = new logs.LogGroup(this, "ExecutionAuditLogGroup", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    new events.Rule(this, "StateMachineStatusRule", {
      eventPattern: {
        source: ["aws.states"],
        detailType: ["Step Functions Execution Status Change"],
        detail: {
          stateMachineArn: [stateMachine.stateMachineArn]
        }
      },
      targets: [
        new eventsTargets.CloudWatchLogGroup(auditLogGroup),
        new eventsTargets.LambdaFunction(executionStatusFunction)
      ]
    });

    const apiFunctionLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "ApiFunctionLogGroupRef",
      `/aws/lambda/${apiFunction.functionName}`
    );
    const pipelineFunctionLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "PipelineFunctionLogGroupRef",
      `/aws/lambda/${pipelineFunction.functionName}`
    );
    const imageWorkerLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "ImageWorkerFunctionLogGroupRef",
      `/aws/lambda/${imageWorkerFunction.functionName}`
    );
    const checkImagesLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "CheckImagesFunctionLogGroupRef",
      `/aws/lambda/${checkImagesFunction.functionName}`
    );
    const finalizeFunctionLogGroup = logs.LogGroup.fromLogGroupName(
      this,
      "FinalizeFunctionLogGroupRef",
      `/aws/lambda/${finalizeFunction.functionName}`
    );

    new logs.MetricFilter(this, "PipelineProviderErrorMetricFilter", {
      logGroup: pipelineFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "ProviderErrorCount",
      filterPattern: logs.FilterPattern.literal("PROVIDER_ERROR"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "ImageWorkerProviderErrorMetricFilter", {
      logGroup: imageWorkerLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "ProviderErrorCount",
      filterPattern: logs.FilterPattern.literal("PROVIDER_ERROR"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "ApiSsmConfigFailureMetricFilter", {
      logGroup: apiFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "SsmConfigLoadFailureCount",
      filterPattern: logs.FilterPattern.literal("SSM_CONFIG_LOAD_FAILURE"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "PipelineSsmConfigFailureMetricFilter", {
      logGroup: pipelineFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "SsmConfigLoadFailureCount",
      filterPattern: logs.FilterPattern.literal("SSM_CONFIG_LOAD_FAILURE"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "ImageWorkerSsmConfigFailureMetricFilter", {
      logGroup: imageWorkerLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "SsmConfigLoadFailureCount",
      filterPattern: logs.FilterPattern.literal("SSM_CONFIG_LOAD_FAILURE"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "ApiStripeWebhookFailureMetricFilter", {
      logGroup: apiFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "StripeWebhookFailureCount",
      filterPattern: logs.FilterPattern.literal("STRIPE_WEBHOOK_FAILURE"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "ApiStripeWebhookDuplicateMetricFilter", {
      logGroup: apiFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "StripeWebhookDuplicateCount",
      filterPattern: logs.FilterPattern.literal("STRIPE_WEBHOOK_DUPLICATE"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "ApiStripeCheckoutCreatedMetricFilter", {
      logGroup: apiFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "StripeCheckoutCreatedCount",
      filterPattern: logs.FilterPattern.literal("STRIPE_CHECKOUT_CREATED"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "ApiStripeWebhookCompletedMetricFilter", {
      logGroup: apiFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "StripeWebhookCompletedCount",
      filterPattern: logs.FilterPattern.literal("STRIPE_WEBHOOK_COMPLETED"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "PipelineNeedsReviewMetricFilter", {
      logGroup: pipelineFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "NeedsReviewCount",
      filterPattern: logs.FilterPattern.literal("BOOK_NEEDS_REVIEW"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "CheckImagesNeedsReviewMetricFilter", {
      logGroup: checkImagesLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "NeedsReviewCount",
      filterPattern: logs.FilterPattern.literal("BOOK_NEEDS_REVIEW"),
      metricValue: "1"
    });
    new logs.MetricFilter(this, "FinalizeNeedsReviewMetricFilter", {
      logGroup: finalizeFunctionLogGroup,
      metricNamespace: "AiChildrensBook",
      metricName: "NeedsReviewCount",
      filterPattern: logs.FilterPattern.literal("BOOK_NEEDS_REVIEW"),
      metricValue: "1"
    });

    const dashboard = new cloudwatch.Dashboard(this, "OpsDashboard", {
      dashboardName: `${this.stackName}-ops`
    });

    const workflowFailedMetric = stateMachine.metricFailed();
    const workflowSucceededMetric = stateMachine.metricSucceeded();
    const queueDepthMetric = imageQueue.metricApproximateNumberOfMessagesVisible();
    const api5xxMetric = api.metricServerError();
    const rendererTaskFailedMetric = rendererService.service.metric("RunningTaskCount", {
      statistic: "Average"
    });
    const providerErrorMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "ProviderErrorCount",
      statistic: "Sum",
      period: cdk.Duration.minutes(5)
    });
    const ssmConfigLoadFailureMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "SsmConfigLoadFailureCount",
      statistic: "Sum",
      period: cdk.Duration.minutes(5)
    });
    const stripeWebhookFailureMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "StripeWebhookFailureCount",
      statistic: "Sum",
      period: cdk.Duration.minutes(5)
    });
    const stripeWebhookDuplicateMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "StripeWebhookDuplicateCount",
      statistic: "Sum",
      period: cdk.Duration.minutes(5)
    });
    const stripeCheckoutCreatedMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "StripeCheckoutCreatedCount",
      statistic: "Sum",
      period: cdk.Duration.minutes(5)
    });
    const stripeWebhookCompletedMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "StripeWebhookCompletedCount",
      statistic: "Sum",
      period: cdk.Duration.minutes(5)
    });
    const needsReviewMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "NeedsReviewCount",
      statistic: "Sum",
      period: cdk.Duration.minutes(5)
    });
    const orderStuckMetric = new cloudwatch.Metric({
      namespace: "AiChildrensBook",
      metricName: "OrderStuckCount",
      statistic: "Maximum",
      period: cdk.Duration.minutes(5)
    });

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "State Machine Failures",
        left: [workflowFailedMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Image Queue Depth",
        left: [queueDepthMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "API 5XX",
        left: [api5xxMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Renderer Running Task Count",
        left: [rendererTaskFailedMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Provider Error Count",
        left: [providerErrorMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "SSM Config Load Failures",
        left: [ssmConfigLoadFailureMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Stripe Webhook Failures",
        left: [stripeWebhookFailureMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Stripe Duplicates",
        left: [stripeWebhookDuplicateMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Needs Review Signals",
        left: [needsReviewMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Order Stuck Count",
        left: [orderStuckMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Payment Conversion Funnel",
        left: [stripeCheckoutCreatedMetric, stripeWebhookCompletedMetric]
      }),
      new cloudwatch.GraphWidget({
        title: "Pipeline Success vs Failure",
        left: [workflowSucceededMetric, workflowFailedMetric]
      })
    );

    new cloudwatch.Alarm(this, "WorkflowFailuresAlarm", {
      metric: workflowFailedMetric,
      threshold: 1,
      evaluationPeriods: 1
    });

    new cloudwatch.Alarm(this, "QueueDepthAlarm", {
      metric: queueDepthMetric,
      threshold: 20,
      evaluationPeriods: 1
    });

    new cloudwatch.Alarm(this, "Api5xxAlarm", {
      metric: api5xxMetric,
      threshold: 5,
      evaluationPeriods: 1
    });

    new cloudwatch.Alarm(this, "RendererTaskAlarm", {
      metric: rendererTaskFailedMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD
    });

    new cloudwatch.Alarm(this, "ProviderErrorSpikeAlarm", {
      metric: providerErrorMetric,
      threshold: 5,
      evaluationPeriods: 1
    });

    new cloudwatch.Alarm(this, "SsmConfigLoadFailureAlarm", {
      metric: ssmConfigLoadFailureMetric,
      threshold: 1,
      evaluationPeriods: 1
    });
    new cloudwatch.Alarm(this, "StripeWebhookFailureAlarm", {
      metric: stripeWebhookFailureMetric,
      threshold: 1,
      evaluationPeriods: 1
    });
    new cloudwatch.Alarm(this, "StripeWebhookDuplicateSpikeAlarm", {
      metric: stripeWebhookDuplicateMetric,
      threshold: 20,
      evaluationPeriods: 1
    });
    new cloudwatch.Alarm(this, "NeedsReviewSpikeAlarm", {
      metric: needsReviewMetric,
      threshold: 3,
      evaluationPeriods: 1
    });
    new cloudwatch.Alarm(this, "OrderStuckAlarm", {
      metric: orderStuckMetric,
      threshold: 1,
      evaluationPeriods: 1
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new cdk.CfnOutput(this, "WebDistributionUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "ArtifactBucketName", { value: artifactBucket.bucketName });
    new cdk.CfnOutput(this, "IdempotencyTableName", { value: idempotencyTable.tableName });
    new cdk.CfnOutput(this, "BookBuildStateMachineArn", { value: stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, "ImageQueueUrl", { value: imageQueue.queueUrl });
    new cdk.CfnOutput(this, "PrivacyPurgeQueueUrl", { value: privacyPurgeQueue.queueUrl });
    new cdk.CfnOutput(this, "DbClusterArn", { value: cluster.clusterArn });
    if (cluster.secret) {
      new cdk.CfnOutput(this, "DbSecretArn", { value: cluster.secret.secretArn });
    }
  }
}
