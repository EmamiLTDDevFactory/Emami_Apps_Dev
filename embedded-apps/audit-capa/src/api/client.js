const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, "");

// The app's own session JWT (issued by /api/auth/login, stored by Layout.js / App.js). Sent on
// every API call so the backend can tell who is asking — see backend/middleware/requireAuth.js.
// localStorage can throw (private mode / blocked storage), in which case we just send nothing.
export const getAuthHeader = () => {
  try {
    const token = localStorage.getItem("authToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (_) {
    return {};
  }
};

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
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

    const error = new Error(message);
    error.status = response.status;
    throw error;
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
