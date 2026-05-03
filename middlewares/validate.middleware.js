import { ApiError } from "../utils/apiResponse.js";

export const validate = (schema, source = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    throw new ApiError(422, "Validation failed", result.error.flatten());
  }

  if (source === "query") {
    req.validatedQuery = result.data;
  } else if (source === "params") {
    req.validatedParams = result.data;
    req[source] = result.data;
  } else {
    req.validatedBody = result.data;
    req[source] = result.data;
  }
  next();
};
