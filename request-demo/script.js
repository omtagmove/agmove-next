import "../shared/script.js";

/** Prepare an email draft for a demo request. */
export function initDemoForm() {
  document.querySelector("#demo-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const subject = "AGMOVE demo request — " + formData.get("sector");
    const emailBody = `Name: ${formData.get("name")}\nEmail: ${formData.get("email")}\nOrganization: ${formData.get("organization")}\nArea of interest: ${formData.get("sector")}\n\n${formData.get("message")}`;
    window.location.href =
      "mailto:hello@agmove.in?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(emailBody);
    document.querySelector("#form-status").textContent =
      "Your email draft is ready to open. Send it from your email app to complete your enquiry. If no app opens, email hello@agmove.in directly.";
  });

  const status = document.querySelector("#form-status");
  if (status)
    status.textContent = "Request a demo: share your application and preferred timeframe below.";
}

if (typeof document !== "undefined") initDemoForm();
