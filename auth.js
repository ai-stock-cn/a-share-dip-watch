"use strict";

(() => {
  const AUTH_CONFIG = Object.freeze({
    username: "admin",
    saltHex: "e30178e5a44952ed1fb5b3fd72ba42c2",
    verifierHex: "857630e888bda8dd08c5d7c5c6b3a694d0b999b67d96436f0b316a8239ae76ed",
    iterations: 210000,
  });
  const SESSION_KEY = "a-share-dip-watch:authenticated:v1";
  const REMEMBER_KEY = "a-share-dip-watch:remembered-login:v1";
  const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
  const encoder = new TextEncoder();

  function hexToBytes(value) {
    const pairs = value.match(/.{2}/g) || [];
    return Uint8Array.from(pairs, (pair) => Number.parseInt(pair, 16));
  }

  function bytesToHex(value) {
    return Array.from(new Uint8Array(value), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  function constantTimeEqual(left, right) {
    const length = Math.max(left.length, right.length);
    let difference = left.length ^ right.length;
    for (let index = 0; index < length; index += 1) {
      difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
    }
    return difference === 0;
  }

  async function deriveVerifier(password) {
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: hexToBytes(AUTH_CONFIG.saltHex),
        iterations: AUTH_CONFIG.iterations,
      },
      keyMaterial,
      256,
    );
    return bytesToHex(bits);
  }

  function setAuthenticated(value) {
    document.body.classList.toggle("auth-locked", !value);
    document.body.dataset.authenticated = value ? "true" : "false";
    document.querySelector("#authGate")?.setAttribute("aria-hidden", value ? "true" : "false");
  }

  function unlock() {
    setAuthenticated(true);
    window.dispatchEvent(new Event("stock-authenticated"));
  }

  function hasSavedLogin() {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "authenticated") return true;
      const remembered = JSON.parse(localStorage.getItem(REMEMBER_KEY));
      if (Number(remembered?.expiresAt) > Date.now()) return true;
      localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // The login form remains available when browser storage is unavailable.
    }
    return false;
  }

  function saveLogin(remember) {
    try {
      sessionStorage.setItem(SESSION_KEY, "authenticated");
      if (remember) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({
          expiresAt: Date.now() + REMEMBER_DURATION_MS,
        }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch {
      // The unlocked page still works when browser storage is unavailable.
    }
  }

  function clearLogin() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    } catch {
      // Reloading still restores the locked state if storage is unavailable.
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    const form = document.querySelector("#loginForm");
    const usernameInput = document.querySelector("#loginUsername");
    const passwordInput = document.querySelector("#loginPassword");
    const errorMessage = document.querySelector("#loginError");
    const loginButton = document.querySelector("#loginButton");
    const rememberLogin = document.querySelector("#rememberLogin");
    const logoutButton = document.querySelector("#logoutButton");

    if (hasSavedLogin()) {
      unlock();
    } else {
      setAuthenticated(false);
      window.requestAnimationFrame(() => usernameInput?.focus());
    }

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorMessage.textContent = "";
      loginButton.disabled = true;
      loginButton.textContent = "验证中";

      try {
        const verifier = await deriveVerifier(passwordInput.value);
        const validUsername = constantTimeEqual(usernameInput.value.trim(), AUTH_CONFIG.username);
        const validPassword = constantTimeEqual(verifier, AUTH_CONFIG.verifierHex);
        if (!validUsername || !validPassword) {
          errorMessage.textContent = "账号或密码不正确";
          passwordInput.select();
          return;
        }

        saveLogin(rememberLogin.checked);
        form.reset();
        unlock();
      } catch {
        errorMessage.textContent = "当前浏览器无法完成验证，请更新后重试";
      } finally {
        loginButton.disabled = false;
        loginButton.textContent = "登录";
      }
    });

    logoutButton?.addEventListener("click", () => {
      clearLogin();
      window.location.reload();
    });
  });
})();
