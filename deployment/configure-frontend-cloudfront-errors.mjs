import fs from "node:fs";

const configPath = process.argv[2];
if (!configPath) throw new Error("Pass the CloudFront distribution-config JSON path.");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const current = Array.isArray(config.CustomErrorResponses?.Items)
  ? config.CustomErrorResponses.Items
  : [];
const retained = current.filter((item) => ![403, 404].includes(Number(item?.ErrorCode)));
const notFoundResponses = [403, 404].map((errorCode) => ({
  ErrorCode: errorCode,
  ResponsePagePath: "/404.html",
  ResponseCode: "404",
  ErrorCachingMinTTL: 0,
}));
const items = [...retained, ...notFoundResponses];

config.CustomErrorResponses = { Quantity: items.length, Items: items };
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
