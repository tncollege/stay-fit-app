import React, { useState } from "react";

export default function FeedbackSection() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    await fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formData as any).toString(),
    });

    setLoading(false);
    setSubmitted(true);
    form.reset();
  };

  if (submitted) {
    return (
      <section className="rounded-3xl bg-white/90 p-6 shadow-sm border border-slate-200">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">
            Thank you for your feedback! 🙏
          </h2>
          <p className="mt-2 text-slate-600">
            Your response has been submitted successfully. Your feedback helps us improve StayFitInLife.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="mt-5 rounded-2xl bg-slate-900 px-5 py-3 text-white font-semibold"
          >
            Submit Another Feedback
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white/90 p-6 shadow-sm border border-slate-200">
      <h2 className="text-2xl font-bold text-slate-900">
        Help Us Improve StayFitInLife
      </h2>
      <p className="mt-2 text-slate-600">
        Share your experience so we can build a better fitness app for you.
      </p>

      <form
        name="feedback"
        method="POST"
        data-netlify="true"
        data-netlify-honeypot="bot-field"
        onSubmit={handleSubmit}
        className="mt-6 space-y-4"
      >
        <input type="hidden" name="form-name" value="feedback" />

        <p className="hidden">
          <label>
            Don’t fill this out: <input name="bot-field" />
          </label>
        </p>

        <input
          name="name"
          type="text"
          placeholder="Your Name"
          className="w-full rounded-2xl border border-slate-200 p-3"
        />

        <select
          name="goal"
          className="w-full rounded-2xl border border-slate-200 p-3"
          required
        >
          <option value="">Select Your Fitness Goal</option>
          <option>Fat Loss</option>
          <option>Muscle Gain</option>
          <option>Body Recomposition</option>
          <option>General Fitness</option>
        </select>

        <select
          name="rating"
          className="w-full rounded-2xl border border-slate-200 p-3"
          required
        >
          <option value="">Overall Rating</option>
          <option value="5">⭐⭐⭐⭐⭐ Excellent</option>
          <option value="4">⭐⭐⭐⭐ Good</option>
          <option value="3">⭐⭐⭐ Average</option>
          <option value="2">⭐⭐ Needs Improvement</option>
          <option value="1">⭐ Poor</option>
        </select>

        <textarea
          name="liked_feature"
          placeholder="Which feature did you like most?"
          rows={3}
          className="w-full rounded-2xl border border-slate-200 p-3"
        />

        <textarea
          name="improvement"
          placeholder="What should we improve?"
          rows={3}
          className="w-full rounded-2xl border border-slate-200 p-3"
        />

        <textarea
          name="feedback"
          placeholder="Any final feedback?"
          rows={5}
          className="w-full rounded-2xl border border-slate-200 p-3"
          required
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-slate-900 p-3 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Submitting..." : "Submit Feedback"}
        </button>
      </form>
    </section>
  );
}