export function generateOrderId(): string {
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  return `ORD${randomNum}`;
}

export function generateOrderIdWithTimestamp(): string {
  const timestamp = Date.now().toString().slice(-5);
  const randomNum = Math.floor(10000 + Math.random() * 90000);
  return `ORD${timestamp}${randomNum}`.slice(0, 13);
}
