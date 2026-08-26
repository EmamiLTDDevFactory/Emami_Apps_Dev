const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `API request failed: ${response.status}`;

    try {
      const body = await response.json();
      message = body.message || message;
    } catch (_) {
      // Keep the default message when the response is not JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

export const apiGet = (path) => request(path);

export const apiPost = (path, body) =>
  request(path, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const apiPut = (path, body) =>
  request(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const apiPatch = (path, body) =>
  request(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const apiDelete = (path) =>
  request(path, {
    method: "DELETE",
  });

export { API_BASE_URL, API_ORIGIN };
