(function () {
  "use strict";

  // ------------------------------------------------------------ mobile nav
  var menuToggle = document.getElementById("menu-toggle");
  var navLinks = document.querySelector(".nav-links");
  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
      var isOpen = navLinks.classList.toggle("is-open-mobile");
      navLinks.style.display = isOpen ? "flex" : "";
      menuToggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // ------------------------------------------------------------------ faq
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var question = item.querySelector(".faq-question");
    var answer = item.querySelector(".faq-answer");
    if (!question || !answer) return;

    question.setAttribute("aria-expanded", "false");
    answer.style.maxHeight = "0px";

    question.addEventListener("click", function () {
      var isOpen = item.classList.contains("is-open");

      document.querySelectorAll(".faq-item.is-open").forEach(function (openItem) {
        if (openItem !== item) {
          openItem.classList.remove("is-open");
          openItem.querySelector(".faq-question").setAttribute("aria-expanded", "false");
          openItem.querySelector(".faq-answer").style.maxHeight = "0px";
        }
      });

      if (isOpen) {
        item.classList.remove("is-open");
        question.setAttribute("aria-expanded", "false");
        answer.style.maxHeight = "0px";
      } else {
        item.classList.add("is-open");
        question.setAttribute("aria-expanded", "true");
        answer.style.maxHeight = answer.scrollHeight + "px";
      }
    });
  });

  // -------------------------------------------------------- session state
  var STORAGE_KEY = "avt_session";

  function getSession() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function renderNavForSession() {
    var session = getSession();
    var loginBtn = document.getElementById("nav-login-btn");
    var signupBtn = document.getElementById("nav-signup-btn");
    var userBox = document.getElementById("nav-user");
    var avatar = document.getElementById("nav-avatar");

    if (!userBox) return;

    if (session && session.email) {
      if (loginBtn) loginBtn.classList.add("is-hidden");
      if (signupBtn) signupBtn.classList.add("is-hidden");
      userBox.classList.remove("is-hidden");
      if (avatar) {
        avatar.textContent = session.email.charAt(0);
        avatar.title = session.email;
      }
    } else {
      if (loginBtn) loginBtn.classList.remove("is-hidden");
      if (signupBtn) signupBtn.classList.remove("is-hidden");
      userBox.classList.add("is-hidden");
    }
  }

  var logoutBtn = document.getElementById("nav-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function () {
      localStorage.removeItem(STORAGE_KEY);
      renderNavForSession();
    });
  }

  renderNavForSession();
})();
