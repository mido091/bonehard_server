import { createUser, getUserByEmail, getUserById } from "../repositories/user.repository.js";
import { ApiError } from "../utils/apiResponse.js";
import { hashPassword, verifyPassword } from "../utils/password.js";

const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address,
  role: user.role,
  isActive: user.isActive === undefined ? true : Boolean(user.isActive),
  createdAt: user.createdAt,
});

export const loginUser = async ({ email, password }) => {
  const user = await getUserByEmail(email);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }

  if (user.isActive !== undefined && !user.isActive) {
    throw new ApiError(403, "This account is disabled");
  }

  return publicUser(user);
};

export const getCurrentUser = async (id) => {
  const user = await getUserById(id);

  if (!user) {
    throw new ApiError(401, "Invalid session");
  }

  if (user.isActive !== undefined && !user.isActive) {
    throw new ApiError(403, "This account is disabled");
  }

  return publicUser(user);
};

export const registerUser = async (payload) => {
  const existingUser = await getUserByEmail(payload.email);

  if (existingUser) {
    throw new ApiError(409, "Email is already registered");
  }

  const user = await createUser({
    name: payload.name,
    email: payload.email,
    passwordHash: await hashPassword(payload.password),
    phone: payload.phone,
    address: payload.address,
  });

  return publicUser(user);
};
