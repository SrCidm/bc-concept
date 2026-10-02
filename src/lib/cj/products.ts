import { getCJAccessToken } from "./auth";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0";

export async function getCJProducts(pageNum: number = 1, pageSize: number = 20) {
  const token = await getCJAccessToken();

  if (!token) {
    throw new Error("Unable to obtain CJ Access Token");
  }

  const response = await fetch(
    `${CJ_API_BASE}/v1/product/list?pageNum=${pageNum}&pageSize=${pageSize}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "CJ-Access-Token": token,
      },
    }
  );

  return await response.json();
}
