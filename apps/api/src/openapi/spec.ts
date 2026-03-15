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
      SessionResponse: {
        type: "object",
        required: ["user", "capabilities"],
        properties: {
          user: {
            type: "object",
            required: ["id", "email"],
            properties: {
              id: { type: "string", format: "uuid" },
              email: { type: "string", format: "email" }
            }
          },
          capabilities: {
            type: "object",
            required: ["canReview"],
            properties: {
              canReview: { type: "boolean" }
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
          "readingProfileId",
          "characterDescription"
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
          },
          characterDescription: { type: "string", minLength: 1, maxLength: 1000 }
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
      GenerateCharacterCandidateRequest: {
        type: "object",
        properties: {
          characterDescription: { type: "string", minLength: 1, maxLength: 1000 }
        }
      },
      SelectCharacterRequest: {
        type: "object",
        required: ["imageId"],
        properties: {
          imageId: { type: "string", format: "uuid" }
        }
      },
      BookCharacterResponse: {
        type: "object",
        required: [
          "bookId",
          "characterDescription",
          "selectedCharacterImageId",
          "selectedCharacterImageUrl",
          "generationCount",
          "maxGenerations",
          "remainingGenerations",
          "canGenerateMore",
          "candidates"
        ],
        properties: {
          bookId: { type: "string", format: "uuid" },
          characterDescription: { type: "string" },
          selectedCharacterImageId: { type: ["string", "null"], format: "uuid" },
          selectedCharacterImageUrl: { type: ["string", "null"] },
          generationCount: { type: "integer", minimum: 0 },
          maxGenerations: { type: "integer", minimum: 1 },
          remainingGenerations: { type: "integer", minimum: 0 },
          canGenerateMore: { type: "boolean" },
          candidates: {
            type: "array",
            items: {
              type: "object",
              required: ["imageId", "imageUrl", "createdAt", "isSelected"],
              properties: {
                imageId: { type: "string", format: "uuid" },
                imageUrl: { type: ["string", "null"] },
                createdAt: { type: "string" },
                isSelected: { type: "boolean" }
              }
            }
          }
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
          productFamily: {
            type: "string",
            enum: ["picture_book_fixed_layout", "chapter_book_reflowable"]
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
                imageUrl: { type: ["string", "null"] },
                previewImageUrl: { type: ["string", "null"] },
                templateId: { type: "string", nullable: true },
                productFamily: {
                  type: "string",
                  enum: ["picture_book_fixed_layout", "chapter_book_reflowable"]
                }
              }
            }
          }
        }
      },
      ReviewActionRequest: {
        type: "object",
        properties: {
          notes: { type: "string", minLength: 1, maxLength: 2000 }
        }
      },
      ReviewQueueResponse: {
        type: "object",
        required: ["cases"],
        properties: {
          cases: {
            type: "array",
            items: {
              type: "object",
              required: [
                "caseId",
                "status",
                "stage",
                "reasonSummary",
                "createdAt",
                "orderId",
                "orderStatus",
                "bookId",
                "bookStatus",
                "childFirstName",
                "readingProfileId",
                "moneyLessonKey",
                "pageCount"
              ],
              properties: {
                caseId: { type: "string", format: "uuid" },
                status: { type: "string", enum: ["open", "resolved", "rejected", "retrying"] },
                stage: { type: "string", enum: ["text_moderation", "image_safety", "image_qa", "finalize_gate"] },
                reasonSummary: { type: "string" },
                createdAt: { type: "string" },
                resolvedAt: { type: ["string", "null"] },
                orderId: { type: "string", format: "uuid" },
                orderStatus: {
                  type: "string",
                  enum: ["created", "checkout_pending", "paid", "building", "needs_review", "ready", "failed", "refunded"]
                },
                bookId: { type: "string", format: "uuid" },
                bookStatus: { type: "string", enum: ["draft", "building", "needs_review", "ready", "failed"] },
                childFirstName: { type: "string" },
                readingProfileId: {
                  type: "string",
                  enum: ["read_aloud_3_4", "early_decoder_5_7", "independent_8_10"]
                },
                moneyLessonKey: {
                  type: "string",
                  enum: ["inflation_candy", "saving_later", "delayed_gratification"]
                },
                pageCount: { type: "integer", minimum: 0 },
                latestAction: {
                  type: ["string", "null"],
                  enum: ["approve_continue", "reject", "retry_page", null]
                },
                latestReviewerEmail: { type: ["string", "null"] }
              }
            }
          }
        }
      },
      ReviewCaseDetailResponse: {
        type: "object",
        required: [
          "caseId",
          "status",
          "stage",
          "reasonSummary",
          "reason",
          "createdAt",
          "order",
          "book",
          "pdfUrl",
          "scenePlan",
          "imagePlan",
          "artifacts",
          "evaluations",
          "events",
          "pages"
        ],
        properties: {
          caseId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["open", "resolved", "rejected", "retrying"] },
          stage: { type: "string", enum: ["text_moderation", "image_safety", "image_qa", "finalize_gate"] },
          reasonSummary: { type: "string" },
          reason: { type: "object", additionalProperties: true },
          createdAt: { type: "string" },
          resolvedAt: { type: ["string", "null"] },
          order: {
            type: "object",
            required: ["orderId", "status"],
            properties: {
              orderId: { type: "string", format: "uuid" },
              status: {
                type: "string",
                enum: ["created", "checkout_pending", "paid", "building", "needs_review", "ready", "failed", "refunded"]
              }
            }
          },
          book: {
            type: "object",
            required: ["bookId", "status", "childFirstName", "readingProfileId", "moneyLessonKey"],
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
              }
            }
          },
          pdfUrl: { type: ["string", "null"] },
          scenePlan: {
            type: ["object", "null"],
            required: ["url", "createdAt"],
            properties: {
              url: { type: ["string", "null"] },
              createdAt: { type: "string" }
            }
          },
          imagePlan: {
            type: ["object", "null"],
            required: ["url", "createdAt"],
            properties: {
              url: { type: ["string", "null"] },
              createdAt: { type: "string" }
            }
          },
          artifacts: {
            type: "array",
            items: {
              type: "object",
              required: ["artifactType", "url", "createdAt"],
              properties: {
                artifactType: { type: "string" },
                url: { type: ["string", "null"] },
                createdAt: { type: "string" }
              }
            }
          },
          evaluations: {
            type: "array",
            items: {
              type: "object",
              required: ["stage", "modelUsed", "verdict", "score", "createdAt"],
              properties: {
                stage: { type: "string" },
                modelUsed: { type: "string" },
                verdict: { type: "string" },
                notes: { type: ["string", "null"] },
                score: { type: "object", additionalProperties: true },
                createdAt: { type: "string" }
              }
            }
          },
          events: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "reviewerEmail", "action", "metadata", "createdAt"],
              properties: {
                id: { type: "string", format: "uuid" },
                reviewerEmail: { type: "string", format: "email" },
                action: { type: "string", enum: ["approve_continue", "reject", "retry_page"] },
                notes: { type: ["string", "null"] },
                pageId: { type: ["string", "null"], format: "uuid" },
                metadata: { type: "object", additionalProperties: true },
                createdAt: { type: "string" }
              }
            }
          },
          pages: {
            type: "array",
            items: {
              type: "object",
              required: [
                "pageId",
                "pageIndex",
                "status",
                "text",
                "previewImageUrl",
                "pageArtUrl",
                "latestQaIssues",
                "qaMetrics",
                "provenance",
                "retryCount"
              ],
              properties: {
                pageId: { type: "string", format: "uuid" },
                pageIndex: { type: "integer", minimum: 0 },
                status: { type: "string", enum: ["pending", "ready", "failed"] },
                text: { type: "string" },
                templateId: { type: ["string", "null"] },
                previewImageUrl: { type: ["string", "null"] },
                pageArtUrl: { type: ["string", "null"] },
                latestQaIssues: { type: "array", items: { type: "string" } },
                qaMetrics: {
                  type: ["object", "null"],
                  additionalProperties: true
                },
                provenance: {
                  type: "object",
                  additionalProperties: true
                },
                retryCount: { type: "integer", minimum: 0 }
              }
            }
          }
        }
      },
      ReviewActionResponse: {
        type: "object",
        required: ["ok", "caseId", "status"],
        properties: {
          ok: { type: "boolean" },
          caseId: { type: "string", format: "uuid" },
          pageId: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["retrying", "rejected"] },
          executionArn: { type: ["string", "null"] }
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
    "/v1/session": {
      get: {
        summary: "Get current session and reviewer capability",
        security: bearerAuth,
        responses: {
          "200": {
            description: "Session details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SessionResponse" }
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
          },
          "422": {
            description: "Reading profile not enabled",
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
          },
          "409": {
            description: "Character selection required or order not eligible for checkout",
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
    "/v1/books/{bookId}/character": {
      get: {
        summary: "Get the current character approval state for a book",
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
            description: "Character approval state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BookCharacterResponse" }
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
            description: "Book not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/books/{bookId}/character/candidates": {
      post: {
        summary: "Generate one more character candidate for parent review",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "bookId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/GenerateCharacterCandidateRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated character approval state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BookCharacterResponse" }
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
            description: "Book not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "409": {
            description: "Character workflow unavailable or attempt cap reached",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "422": {
            description: "Character description required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/books/{bookId}/character/select": {
      post: {
        summary: "Select one character candidate as the canonical reference",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "bookId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SelectCharacterRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated character approval state",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BookCharacterResponse" }
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
            description: "Book or candidate not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "409": {
            description: "Character workflow unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/review/cases": {
      get: {
        summary: "List open or historical review cases",
        security: bearerAuth,
        parameters: [
          {
            in: "query",
            name: "status",
            required: false,
            schema: { type: "string", enum: ["open", "resolved", "rejected", "retrying"], default: "open" }
          },
          {
            in: "query",
            name: "stage",
            required: false,
            schema: { type: "string", enum: ["text_moderation", "image_safety", "image_qa", "finalize_gate"] }
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 }
          }
        ],
        responses: {
          "200": {
            description: "Review case queue",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewQueueResponse" }
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
          "403": {
            description: "Reviewer access required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/review/cases/{caseId}": {
      get: {
        summary: "Get one review case with page QA details",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "caseId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        responses: {
          "200": {
            description: "Review case detail",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewCaseDetailResponse" }
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
          "403": {
            description: "Reviewer access required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "404": {
            description: "Review case not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/review/cases/{caseId}/approve": {
      post: {
        summary: "Approve a review case and resume the pipeline",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "caseId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReviewActionRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Review approved and pipeline resumed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewActionResponse" }
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
          "403": {
            description: "Reviewer access required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "404": {
            description: "Review case not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "409": {
            description: "Review case is not open",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/review/cases/{caseId}/reject": {
      post: {
        summary: "Reject a review case and fail the book",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "caseId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReviewActionRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Review rejected",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewActionResponse" }
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
          "403": {
            description: "Reviewer access required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "404": {
            description: "Review case not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "409": {
            description: "Review case is not open",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/v1/review/cases/{caseId}/pages/{pageId}/retry": {
      post: {
        summary: "Retry one page image from a review case",
        security: bearerAuth,
        parameters: [
          {
            in: "path",
            name: "caseId",
            required: true,
            schema: { type: "string", format: "uuid" }
          },
          {
            in: "path",
            name: "pageId",
            required: true,
            schema: { type: "string", format: "uuid" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReviewActionRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Page retry queued",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewActionResponse" }
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
          "403": {
            description: "Reviewer access required",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "404": {
            description: "Review case or page not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          },
          "409": {
            description: "Retry not allowed",
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
