import React, { useState } from "react";
import { signIn, signUp } from "../services/authService";

export default function Auth({ onAuth }: { onAuth: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    if (!email || !password) {
      return alert("Please enter email and password.");
    }

    const { error } = await signIn(email, password);

    if (error) {
      return alert(error.message);
    }

    onAuth();
  }

  async function handleSignup() {
    if (!email || !password) {
      return alert("Please enter email and password.");
    }

    if (password.length < 6) {
      return alert("Password must be at least 6 characters.");
    }

    const { error } = await signUp(email, password);

    if (error) {
      return alert(error.message);
    }

    alert("Account created. Now login.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
        <h1 className="text-3xl font-black text-lime">STAYFITINLIFE</h1>

        <input
          className="w-full p-4 rounded-xl bg-black border border-white/10"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value.trim())}
        />

        <input
          className="w-full p-4 rounded-xl bg-black border border-white/10"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="w-full p-4 rounded-xl bg-lime text-black font-black"
        >
          LOGIN
        </button>

        <button
          onClick={handleSignup}
          className="w-full p-4 rounded-xl border border-lime text-lime font-black"
        >
          CREATE ACCOUNT
        </button>
      </div>
    </div>
  );
}
