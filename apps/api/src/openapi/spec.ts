const idempotencyHeader = {
  in: "header",
  name: "Idempotency-Key",
  required: true,
  schema: {
    type: "string",
    minLength: 8
  }
} as const;

const mockRunTagHeader = {
  in: "header",
  name: "X-Mock-Run-Tag",
  required: false,
  schema: {
    type: "string",
    minLength: 1
  },
  description:
    "Required when mock LLM or mock image providers are enabled. Used to explicitly authorize intentional mock runs."
} as const;

const bearerAuth = [{ BearerAuth: [] }] as const;

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "AI Children's Book API",
    version: "0.1.0"
  },
  servers: [{ url: "https://api.example.com" }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" }
        }
      },
      RequestLinkRequest: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" }
        }
      },
      RequestLinkResponse: {
        type: "object",
        required: ["ok", "sent"],
        properties: {
          ok: { type: "boolean" },
          sent: { type: "boolean" }
        }
      },
      VerifyLinkRequest: {
        type: "object",
        required: ["token"],
        properties: {
          token: { type: "string" }
        }
      },
      VerifyLinkResponse: {
        type: "object",
        required: ["token", "user"],
        properties: {
          token: { type: "string" },
          user: {
            type: "object",
            required: ["id", "email"],
            properties: {
              id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" }
            }
          }
        }
      },
      CreateOrderRequest: {
        type: "object",
        required: [
          "childFirstName",
          "pronouns",
          "ageYears",
          "moneyLessonKey",
          "interestTags",
          "readingProfileId"
        ],
        properties: {
          childFirstName: { type: "string", minLength: 1 },
          pronouns: { type: "string", minLength: 1 },
          ageYears: { type: "integer", minimum: 2, maximum: 12 },
          moneyLessonKey: {
            type: "string",
            enum: ["inflation_candy", "saving_later", "delayed_gratification"]
          },
          interestTags: {
            type: "array",
            maxItems: 10,
            items: { type: "string", minLength: 1 }
          },
          readingProfileId: {
            type: "string",
            enum: ["read_aloud_3_4", "early_decoder_5_7", "independent_8_10"]
          }
        }
      },
      CreateOrderResponse: {
        type: "object",
        required: ["orderId", "bookId", "childProfileId", "status", "checkoutMode"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          bookId: { type: "string", format: "uuid" },
          childProfileId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["created"] },
          checkoutMode: { type: "string", enum: ["stripe"] }
        }
      },
      CheckoutResponse: {
        type: "object",
        required: ["orderId", "bookId", "status", "checkoutUrl", "stripeSessionId"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          bookId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["created", "checkout_pending", "paid", "building", "needs_review", "ready", "failed", "refunded"]
          },
          checkoutUrl: { type: ["string", "null"] },
          stripeSessionId: { type: ["string", "null"] },
          message: { type: "string" }
        }
      },
      MarkPaidResponse: {
        type: "object",
        required: ["ok", "orderId", "bookId", "executionArn", "started"],
        properties: {
          ok: { type: "boolean" },
          orderId: { type: "string", format: "uuid" },
          bookId: { type: "string", format: "uuid" },
          executionArn: { type: ["string", "null"] },
          started: { type: "boolean" }
        }
      },
      StripeWebhookResponse: {
        type: "object",
        required: ["ok", "stripeEventId", "stripeEventType", "processingStatus", "executionArn"],
        properties: {
          ok: { type: "boolean" },
          stripeEventId: { type: "string" },
          stripeEventType: { type: "string" },
          processingStatus: { type: "string" },
          executionArn: { type: ["string", "null"] }
        }
      },
      OrderResponse: {
        type: "object",
        required: ["orderId", "status", "createdAt", "bookId", "bookStatus", "childProfileId"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["created", "checkout_pending", "paid", "building", "needs_review", "ready", "failed", "refunded"]
          },
          createdAt: { type: "string" },
          bookId: { type: "string", format: "uuid" },
          bookStatus: { type: "string", enum: ["draft", "building", "needs_review", "ready", "failed"] },
          childProfileId: { type: "string", format: "uuid" }
        }
      },
      BookResponse: {
        type: "object",
        required: [
          "bookId",
          "status",
          "childFirstName",
          "readingProfileId",
          "moneyLessonKey",
          "pages"
        ],
        properties: {
          bookId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["draft", "building", "needs_review", "ready", "failed"] },
          childFirstName: { type: "string" },
          readingProfileId: {
            type: "string",
            enum: ["read_aloud_3_4", "early_decoder_5_7", "independent_8_10"]
          },
          moneyLessonKey: {
            type: "string",
            enum: ["inflation_candy", "saving_later", "delayed_gratification"]
          },
          pages: {
            type: "array",
            items: {
              type: "object",
              required: ["pageIndex", "text", "status", "imageUrl"],
              properties: {
                pageIndex: { type: "integer", minimum: 0 },
                text: { type: "string" },
                status: { type: "string", enum: ["pending", "ready", "failed"] },
                imageUrl: { type: ["string", "null"] }
              }
            }
          }
        }
      },
      DownloadResponse: {
        type: "object",
        required: ["url", "expiresInSeconds"],
        properties: {
          url: { type: "string", format: "uri" },
          expiresInSeconds: { type: "integer", minimum: 60 }
        }
      },
      DeleteChildProfileResponse: {
        type: "object",
        required: ["ok", "childProfileId", "privacyEventId", "queuedArtifacts"],
        properties: {
          ok: { type: "boolean" },
          childProfileId: { type: "string", format: "uuid" },
          privacyEventId: { type: "string", format: "uuid" },
          queuedArtifacts: { type: "integer", minimum: 0 }
        }
      }
    }
  },
  paths: {
    "/v1/auth/request-link": {
      post: {
        summary: "Send passwordless login link",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RequestLinkRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Link queued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RequestLinkResponse" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/auth/verify-link": {
      post: {
        summary: "Verify email link and issue session token",
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/VerifyLinkRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Session issued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VerifyLinkResponse" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/orders": {
      post: {
        summary: "Create order draft",
        security: bearerAuth,
        parameters: [idempotencyHeader],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOrderRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Order created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOrderResponse" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "401": {
            description: "Auth required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/orders/{orderId}/checkout": {
      post: {
        summary: "Create Stripe checkout session",
        security: bearerAuth,
        parameters: [
          idempotencyHeader,
          {
            in: "path",
            name: "orderId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "200": {
            description: "Checkout response",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CheckoutResponse" }
              }
            }
          },
          "401": {
            description: "Auth required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "404": {
            description: "Order not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/orders/{orderId}/mark-paid": {
      post: {
        summary: "Mark order paid (fallback-only) and trigger build",
        security: bearerAuth,
        parameters: [
          idempotencyHeader,
          mockRunTagHeader,
          {
            in: "path",
            name: "orderId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "200": {
            description: "Build started",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MarkPaidResponse" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "403": {
            description: "Mock checkout disabled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "401": {
            description: "Auth required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/webhooks/stripe": {
      post: {
        summary: "Stripe webhook receiver",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Webhook handled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StripeWebhookResponse" }
              }
            }
          },
          "400": {
            description: "Invalid signature or payload",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/orders/{orderId}": {
      get: {
        summary: "Get order status",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "orderId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "200": {
            description: "Order state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OrderResponse" }
              }
            }
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "401": {
            description: "Auth required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/books/{bookId}": {
      get: {
        summary: "Get book payload",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "bookId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "200": {
            description: "Book details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BookResponse" }
              }
            }
          },
          "404": {
            description: "Not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "401": {
            description: "Auth required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/books/{bookId}/download": {
      get: {
        summary: "Get signed download URL",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "bookId",
            required: true,
            schema: { type: "string", format: "uuid" }
          },
          {
            in: "query",
            name: "format",
            required: false,
            schema: { type: "string", enum: ["pdf"], default: "pdf" }
          }
        ],
        responses: {
          "200": {
            description: "Signed URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DownloadResponse" }
              }
            }
          },
          "404": {
            description: "PDF not ready",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "401": {
            description: "Auth required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/child-profiles/{childProfileId}": {
      delete: {
        summary: "Delete child profile and queue artifact purge",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "childProfileId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "202": {
            description: "Deletion queued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeleteChildProfileResponse" }
              }
            }
          },
          "404": {
            description: "Child profile not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "401": {
            description: "Auth required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    }
  }
} as const;
