import bcrypt from "bcrypt";

const PASSWORD_ROUNDS = 12;

export const hashPassword = (password) => bcrypt.hash(password, PASSWORD_ROUNDS);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
