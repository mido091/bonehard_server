import { createOrder, deleteOrder, getOrderById, listOrders, updateOrderStatus } from "../repositories/order.repository.js";
import { sendSuccess, ApiError } from "../utils/apiResponse.js";

export const submitOrder = async (req, res) => {
  const { contactName, contactNumber, contactEmail, scopeOfWork, fileLink } = req.validatedBody || req.body;
  const order = await createOrder({ contactName, contactNumber, contactEmail, scopeOfWork, fileLink });
  sendSuccess(res, { data: order, message: "Order submitted successfully", status: 201 });
};

export const getOrders = async (req, res) => {
  const { page = 1, limit = 20, status } = req.validatedQuery || req.query;
  const result = await listOrders({ page, limit, status });
  sendSuccess(res, { data: result.rows, meta: result.meta });
};

export const getOrder = async (req, res) => {
  const order = await getOrderById(req.params.id);
  if (!order) throw new ApiError(404, "Order not found");
  sendSuccess(res, { data: order });
};

export const updateOrder = async (req, res) => {
  const { status, notes } = req.validatedBody || req.body;
  await updateOrderStatus(req.params.id, status, notes);
  sendSuccess(res, { message: "Order updated" });
};

export const removeOrder = async (req, res) => {
  await deleteOrder(req.params.id);
  sendSuccess(res, { message: "Order deleted" });
};
