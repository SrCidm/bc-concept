import { getCJAccessToken } from "./auth";

const CJ_API_BASE = "https://developers.cjdropshipping.com/api2.0";

export async function getCJProducts(pageNum: number = 1, pageSize: number = 20) {
  const token = await getCJAccessToken();

  if (!token) {
    throw new Error("Unable to obtain CJ Access Token");
  }

  const response = await fetch(`${CJ_API_BASE}/v1/product/list`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "CJ-Access-Token": token,
    },
    // Nota: Dependiendo de la API de CJ, algunos endpoints GET requieren params en la URL
    // Si requieren query params:
    // ?pageNum=${pageNum}&pageSize=${pageSize}
  });

  return await response.json();
}
