/** "Back" control: the previous page in this tab's history, or the Emami Apps hub when there is none.
 * Works with App.jsx's useExitToHubOnBack: history.back() fires its popstate handler, which exits to
 * the hub once there is no in-app history left. */
export function goBack() {
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
}
