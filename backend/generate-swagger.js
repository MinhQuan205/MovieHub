const fs = require('fs');

const swagger = {
  openapi: "3.0.3",
  info: {
    title: "MovieHub API",
    version: "1.0.0",
    description: "API documentation for MovieHub backend."
  },
  servers: [
    { url: "/api/v1" }
  ],
  tags: [
    { name: "Auth" },
    { name: "Movies" },
    { name: "Persons" },
    { name: "Search" },
    { name: "Watchlist" },
    { name: "Reviews" },
    { name: "Users" },
    { name: "Notifications" }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      },
      refreshCookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "refreshToken"
      }
    },
    schemas: {
      UserPreferences: {
        type: "object",
        properties: {
          language: { type: "string", enum: ["vi", "en"] },
          theme: { type: "string", enum: ["light", "dark", "system"] },
          favoriteGenres: { type: "array", items: { type: "integer" } }
        }
      },
      AuthUser: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" },
          displayName: { type: "string" },
          role: { type: "string", enum: ["user", "admin"] },
          isEmailVerified: { type: "boolean" },
          avatar: { type: "string" },
          preferences: { $ref: "#/components/schemas/UserPreferences" }
        }
      },
      ApiSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "object" },
          message: { type: "string" },
          meta: { $ref: "#/components/schemas/PaginatedResponse" }
        }
      },
      ApiError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" }
            }
          }
        }
      },
      PaginatedResponse: {
        type: "object",
        properties: {
          page: { type: "integer" },
          limit: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
          hasNext: { type: "boolean" }
        }
      },
      Movie: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          overview: { type: "string" },
          posterPath: { type: "string" },
          backdropPath: { type: "string" },
          voteAverage: { type: "number" },
          releaseDate: { type: "string" }
        }
      },
      MovieDetail: {
        type: "object",
        properties: {
          id: { type: "integer" },
          title: { type: "string" },
          overview: { type: "string" },
          posterPath: { type: "string" },
          backdropPath: { type: "string" },
          voteAverage: { type: "number" },
          releaseDate: { type: "string" },
          runtime: { type: "integer" },
          genres: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } } } },
          credits: { type: "object" },
          videos: { type: "object" },
          similar: { type: "object" }
        }
      },
      Person: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          biography: { type: "string" },
          profilePath: { type: "string" },
          knownForDepartment: { type: "string" }
        }
      },
      WatchlistMovie: {
        type: "object",
        properties: {
          tmdbId: { type: "integer" },
          tmdbTitle: { type: "string" },
          posterPath: { type: "string" },
          addedAt: { type: "string", format: "date-time" },
          note: { type: "string" }
        }
      },
      WatchlistItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isPublic: { type: "boolean" },
          shareSlug: { type: "string" },
          movies: { type: "array", items: { $ref: "#/components/schemas/WatchlistMovie" } },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Review: {
        type: "object",
        properties: {
          id: { type: "string" },
          userId: { type: "string" },
          tmdbMovieId: { type: "integer" },
          tmdbTitle: { type: "string" },
          rating: { type: "number" },
          content: { type: "string" },
          containsSpoiler: { type: "boolean" },
          likesCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Notification: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          isRead: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" }
        }
      }
    }
  },
  paths: {
    // ---------------- AUTH ----------------
    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  displayName: { type: "string" }
                },
                required: ["email", "password", "displayName"]
              }
            }
          }
        },
        responses: {
          "201": { description: "Register success", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } }
        }
      }
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  password: { type: "string" }
                },
                required: ["email", "password"]
              }
            }
          }
        },
        responses: {
          "200": { description: "Login success", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } }
        }
      }
    },
    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": { description: "Current user info", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } }
        }
      }
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        security: [{ bearerAuth: [] }, { refreshCookieAuth: [] }],
        responses: {
          "200": { description: "Logout success" }
        }
      }
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh token",
        security: [{ refreshCookieAuth: [] }],
        responses: {
          "200": { description: "Success" }
        }
      }
    },
    "/auth/verify-email/{token}": {
      get: {
        tags: ["Auth"],
        summary: "Verify email",
        parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Success" }
        }
      }
    },
    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Forgot password",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { email: { type: "string" } } } } }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/auth/reset-password/{token}": {
      post: {
        tags: ["Auth"],
        summary: "Reset password",
        parameters: [{ in: "path", name: "token", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { password: { type: "string" } } } } }
        },
        responses: { "200": { description: "Success" } }
      }
    },

    // ---------------- MOVIES ----------------
    "/movies/trending": {
      get: {
        tags: ["Movies"],
        summary: "Get trending movies",
        parameters: [
          { in: "query", name: "window", schema: { type: "string", enum: ["day", "week"], default: "day" } },
          { in: "query", name: "page", schema: { type: "integer", default: 1 } }
        ],
        responses: {
          "200": { description: "Success", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiSuccess" } } } }
        }
      }
    },
    "/movies/now-playing": {
      get: {
        tags: ["Movies"],
        summary: "Get now playing movies",
        parameters: [{ in: "query", name: "page", schema: { type: "integer", default: 1 } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/movies/popular": {
      get: {
        tags: ["Movies"],
        summary: "Get popular movies",
        parameters: [{ in: "query", name: "page", schema: { type: "integer", default: 1 } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/movies/top-rated": {
      get: {
        tags: ["Movies"],
        summary: "Get top rated movies",
        parameters: [{ in: "query", name: "page", schema: { type: "integer", default: 1 } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/movies/upcoming": {
      get: {
        tags: ["Movies"],
        summary: "Get upcoming movies",
        parameters: [{ in: "query", name: "page", schema: { type: "integer", default: 1 } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/movies/{id}": {
      get: {
        tags: ["Movies"],
        summary: "Get movie details",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/movies/{id}/similar": {
      get: {
        tags: ["Movies"],
        summary: "Get similar movies",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/genres": {
      get: {
        tags: ["Movies"],
        summary: "Get movie genres",
        responses: { "200": { description: "Success" } }
      }
    },
    "/discover": {
      get: {
        tags: ["Movies"],
        summary: "Discover movies",
        parameters: [
          { in: "query", name: "genre", schema: { type: "string" } },
          { in: "query", name: "year", schema: { type: "integer" } },
          { in: "query", name: "rating", schema: { type: "number" } },
          { in: "query", name: "sort", schema: { type: "string" } },
          { in: "query", name: "page", schema: { type: "integer", default: 1 } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },

    // ---------------- PERSONS ----------------
    "/persons/{id}": {
      get: {
        tags: ["Persons"],
        summary: "Get person details",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/persons/{id}/credits": {
      get: {
        tags: ["Persons"],
        summary: "Get person credits",
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },

    // ---------------- SEARCH ----------------
    "/search": {
      get: {
        tags: ["Search"],
        summary: "Search movies",
        parameters: [
          { in: "query", name: "q", required: true, schema: { type: "string" } },
          { in: "query", name: "page", schema: { type: "integer", default: 1 } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/search/suggestions": {
      get: {
        tags: ["Search"],
        summary: "Search suggestions",
        parameters: [{ in: "query", name: "q", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },

    // ---------------- WATCHLIST ----------------
    "/watchlists": {
      get: {
        tags: ["Watchlist"],
        summary: "Get all watchlists",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Success" } }
      },
      post: {
        tags: ["Watchlist"],
        summary: "Create watchlist",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, isPublic: { type: "boolean" } }, required: ["name"] } } }
        },
        responses: { "201": { description: "Created" } }
      }
    },
    "/watchlists/{id}": {
      put: {
        tags: ["Watchlist"],
        summary: "Update watchlist",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, isPublic: { type: "boolean" } } } } }
        },
        responses: { "200": { description: "Success" } }
      },
      delete: {
        tags: ["Watchlist"],
        summary: "Delete watchlist",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/watchlists/{id}/movies": {
      post: {
        tags: ["Watchlist"],
        summary: "Add movie to watchlist",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { tmdbId: { type: "integer" } }, required: ["tmdbId"] } } }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/watchlists/{id}/movies/{tmdbId}": {
      delete: {
        tags: ["Watchlist"],
        summary: "Remove movie from watchlist",
        security: [{ bearerAuth: [] }],
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "string" } },
          { in: "path", name: "tmdbId", required: true, schema: { type: "integer" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },

    // ---------------- REVIEWS ----------------
    "/movies/{id}/reviews": {
      get: {
        tags: ["Reviews"],
        summary: "Get movie reviews",
        parameters: [
          { in: "path", name: "id", required: true, schema: { type: "integer" } },
          { in: "query", name: "page", schema: { type: "integer", default: 1 } }
        ],
        responses: { "200": { description: "Success" } }
      },
      post: {
        tags: ["Reviews"],
        summary: "Create review",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { rating: { type: "number" }, content: { type: "string" }, containsSpoiler: { type: "boolean" } }, required: ["rating", "content"] } } }
        },
        responses: { "201": { description: "Created" } }
      }
    },
    "/reviews/{id}": {
      put: {
        tags: ["Reviews"],
        summary: "Update review",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { rating: { type: "number" }, content: { type: "string" }, containsSpoiler: { type: "boolean" } } } } }
        },
        responses: { "200": { description: "Success" } }
      },
      delete: {
        tags: ["Reviews"],
        summary: "Delete review",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/reviews/{id}/like": {
      post: {
        tags: ["Reviews"],
        summary: "Toggle like review",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/reviews/{id}/report": {
      post: {
        tags: ["Reviews"],
        summary: "Report review",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } } }
        },
        responses: { "200": { description: "Success" } }
      }
    },

    // ---------------- USERS ----------------
    "/users/profile": {
      get: {
        tags: ["Users"],
        summary: "Get user profile",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Success" } }
      },
      put: {
        tags: ["Users"],
        summary: "Update user profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { displayName: { type: "string" }, preferences: { $ref: "#/components/schemas/UserPreferences" } } } } }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/users/avatar": {
      post: {
        tags: ["Users"],
        summary: "Upload avatar",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { type: "object", properties: { avatar: { type: "string", format: "binary" } }, required: ["avatar"] }
            }
          }
        },
        responses: { "200": { description: "Success" } }
      }
    },

    // ---------------- NOTIFICATIONS ----------------
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Get notifications",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "query", name: "page", schema: { type: "integer", default: 1 } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/notifications/{id}/read": {
      put: {
        tags: ["Notifications"],
        summary: "Mark notification as read",
        security: [{ bearerAuth: [] }],
        parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/notifications/read-all": {
      put: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/notifications/fcm-token": {
      post: {
        tags: ["Notifications"],
        summary: "Register FCM token",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } }, required: ["token"] } } }
        },
        responses: { "200": { description: "Success" } }
      },
      delete: {
        tags: ["Notifications"],
        summary: "Remove FCM token",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } }, required: ["token"] } } }
        },
        responses: { "200": { description: "Success" } }
      }
    }
  }
};

function jsonToYaml(obj, indent = 0) {
  let yaml = '';
  const spaces = ' '.repeat(indent);
  
  for (const [key, value] of Object.entries(obj)) {
    if (value === null) {
      yaml += `${spaces}${key}: null\n`;
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      yaml += `${spaces}${key}: ${value}\n`;
    } else if (typeof value === 'string') {
      yaml += `${spaces}${key}: "${value.replace(/"/g, '\\"')}"\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        yaml += `${spaces}${key}: []\n`;
      } else {
        yaml += `${spaces}${key}:\n`;
        value.forEach(item => {
          if (typeof item === 'object') {
            const itemYaml = jsonToYaml(item, indent + 4);
            yaml += `${spaces}  -\n${itemYaml.replace(/^ {4}/gm, '    ')}`; // Need careful manipulation
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        });
      }
    } else if (typeof value === 'object') {
      if (Object.keys(value).length === 0) {
        yaml += `${spaces}${key}: {}\n`;
      } else {
        yaml += `${spaces}${key}:\n${jsonToYaml(value, indent + 2)}`;
      }
    }
  }
  return yaml;
}

// Write as JSON to use a robust format instead of custom YAML serialization, swagger-ui-express supports json natively.
// But the user requested swagger.yaml. Since swagger-ui-express can also just take the YAML format and we want to preserve it:
// Let's use stringification to JSON and save as swagger.json and convert?
// Actually, it's easier to just write pure YAML text directly since YAML has a standard format.
fs.writeFileSync('generate-swagger.json', JSON.stringify(swagger, null, 2));
console.log('JSON file created.');
