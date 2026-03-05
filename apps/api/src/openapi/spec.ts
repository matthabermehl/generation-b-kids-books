const idempotencyHeader = {
  in: "header",
  name: "Idempotency-Key",
  required: true,
  schema: {
    type: "string",
    minLength: 8
  }
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
        required: ["orderId", "bookId", "status", "checkoutMode"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          bookId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["created"] },
          checkoutMode: { type: "string", enum: ["mock"] }
        }
      },
      MarkPaidResponse: {
        type: "object",
        required: ["ok", "orderId", "bookId", "executionArn"],
        properties: {
          ok: { type: "boolean" },
          orderId: { type: "string", format: "uuid" },
          bookId: { type: "string", format: "uuid" },
          executionArn: { type: "string" }
        }
      },
      OrderResponse: {
        type: "object",
        required: ["orderId", "status", "createdAt", "bookId", "bookStatus"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          status: {
            type: "string",
            enum: ["created", "paid", "building", "ready", "failed", "refunded"]
          },
          createdAt: { type: "string" },
          bookId: { type: "string", format: "uuid" },
          bookStatus: { type: "string", enum: ["draft", "building", "ready", "failed"] }
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
          status: { type: "string", enum: ["draft", "building", "ready", "failed"] },
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
    "/v1/orders/{orderId}/mark-paid": {
      post: {
        summary: "Mark order paid (mock) and trigger build",
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
    }
  }
} as const;
