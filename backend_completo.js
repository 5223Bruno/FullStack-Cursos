// backend_completo.js — versão estável, segura e compatível com Firebase v8

(function () {
  'use strict';

  // Configuração do Firebase
  const firebaseConfig = {
      apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es",
      authDomain: "fullstackcursos-a1f5b.firebaseapp.com",
      projectId: "fullstackcursos-a1f5b",
      storageBucket: "fullstackcursos-a1f5b.appspot.com",
      messagingSenderId: "637982443957",
      appId: "1:637982443957:web:1cfa44a6d2065b57c3b92d"
  };

  // Inicializa Firebase com verificação
  if (typeof firebase !== "undefined") {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  } else {
    alert("Erro: SDK do Firebase não foi carregado corretamente.");
  }

  // Firestore
  const db = firebase.firestore();

  // Adicionar curso
  const form = document.getElementById("add-course-form");
  const titleInput = document.getElementById("course-title");
  const linkInput = document.getElementById("course-link");
  const imageInput = document.getElementById("course-image");
  const coursesContainer = document.getElementById("courses-container");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = titleInput.value.trim();
      const link = linkInput.value.trim();
      const image = imageInput.value.trim();

      if (!title || !link || !image) {
        alert("Preencha todos os campos antes de enviar!");
        return;
      }

      try {
        await db.collection("courses").add({
          title,
          link,
          image,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        form.reset();
        fetchCourses();
      } catch (error) {
        console.error("Erro ao adicionar curso:", error);
        alert("Erro ao adicionar curso. Verifique a conexão e tente novamente.");
      }
    });
  }

  // Buscar e renderizar cursos
  async function fetchCourses() {
    if (!coursesContainer) return;

    coursesContainer.innerHTML = "<p class='loading'>Carregando cursos...</p>";

    try {
      const snapshot = await db.collection("courses").orderBy("createdAt", "desc").get();

      if (snapshot.empty) {
        coursesContainer.innerHTML = "<p>Nenhum curso cadastrado ainda.</p>";
        return;
      }

      coursesContainer.innerHTML = "";
      snapshot.forEach((doc) => {
        const course = doc.data();
        const card = document.createElement("div");
        card.className = "course-card";

        card.innerHTML = `
          <img src="${course.image}" alt="${course.title}" loading="lazy">
          <h3>${course.title}</h3>
          <a href="${course.link}" target="_blank" rel="noopener noreferrer">Acessar curso</a>
        `;

        coursesContainer.appendChild(card);
      });
    } catch (error) {
      console.error("Erro ao buscar cursos:", error);
      coursesContainer.innerHTML = "<p class='error'>Erro ao carregar cursos. Verifique sua conexão.</p>";
    }
  }

  // Carrega cursos ao abrir o site
  document.addEventListener("DOMContentLoaded", fetchCourses);
})();
