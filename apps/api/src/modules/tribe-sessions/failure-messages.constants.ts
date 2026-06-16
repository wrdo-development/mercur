/**
 * WRDO-voiced failure messages for registration flows.
 * Must match docs/tribe/WRDO_FAILURE_MESSAGES.md — tests assert these exact strings.
 */

export const WRDO_FAILURE_MESSAGES: Record<string, string> = {
  selfie_no_face_detected:
    "Hmm, I can't quite see your face in that photo. Try a well-lit selfie looking straight at the camera! 📸",
  selfie_multiple_faces: "I see more than one face! Make sure it's just you in the photo. 😊",
  gps_outside_service_area:
    "Shame, it looks like you're outside our service area for now. We're growing fast — we'll let you know when we reach you! 💚",
  gps_accuracy_too_low:
    'Your location came through a bit fuzzy. Could you try again from outside or near a window?',
  document_ocr_failed:
    "I couldn't read that document clearly. Try a flat, well-lit photo of the full document. 📄",
  document_address_mismatch:
    "The address on that document doesn't quite match your location. Is it a current document?",
  name_too_short: 'That name seems a bit short — can you give me your full name?',
  timeout_mid_flow:
    "Still there? No pressure! When you're ready, just send me a message and we'll pick up where we left off. ⏰",
  unrecognised_input: "Hmm, I didn't quite get that. [re-prompt current step question]",
  cancel_mid_flow:
    "No problem! I've saved your progress. Come back any time to finish registration. 👋",
  availability_unclear: "Could you describe when you're typically available? e.g. Mon-Fri 7am-5pm",
  business_name_too_short: 'That business name seems a bit short — can you give me the full name?',
  operating_hours_invalid:
    "I couldn't quite parse those hours. Try something like: Mon-Fri 8am-5pm",
};

// Alias used by booking + registration flows. Same object, distinct import name.
export const FAILURE_MESSAGES = WRDO_FAILURE_MESSAGES;
