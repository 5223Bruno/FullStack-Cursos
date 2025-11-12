// backend_completo.js
// Versão corrigida e robusta mantendo a lógica original.
// Proteções: inicialização segura do Firebase, validações, tratamento de erros.

(function () {
  'use strict';

  // --- firebaseConfig (mantive a sua chave original) ---
  const firebaseConfig = {
      apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es",
      authDomain: "fullstackcursos-a1f5b.firebaseapp.com",
      projectId: "fullstackcursos-a1f5b",
      storageBucket: "fullstackcursos-a1f5b.appspot.com",
      messagingSenderId: "637982443957",
      appId: "1:637982443957:web:1cfa44a6d2065b57c3b92d"
  };

  // Safe init: só inicializa se o SDK do Firebase estiver carregado e não estiver inicializado
  try {
    if (typeof firebase !== 'undefined') {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }
    } else {
      console.warn('Firebase SDK não encontrado. Verifique os <script> no HTML.');
    }
  } catch (e) {
    console.error('Erro ao inicializar Firebase:', e);
  }

  // Só cria referência ao Firestore se o SDK estiver presente
  const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;

  // Utilitária simples para validar URL (retorna true se parecer uma URL)
  function isValidUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  // Mensagem de erro amigável no DOM (fallback para alert)
  function showError(message) {
    try {
      const container = document.getElementById('courses');
      if (container) {
        const el = document.createElement('div');
        el.className = 'error-message';
        el.textContent = message;
        // remove mensagens antigas
        const old = container.querySelector('.error-message');
        if (old) old.remove();
        container.prepend(el);
        return;
      }
    } catch (_){}
    alert(message);
  }

  // Adicionar curso
  (function setupAddCourse() {
    const form = document.getElementById('add-course-form');
    if (!form) return; // nada a fazer se o form não existe

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleEl = document.getElementById('course-title');
      const linkEl = document.getElementById('course-link');
      const imageEl = document.getElementById('course-image');

      const courseTitle = titleEl ? titleEl.value.trim() : '';
      const courseLink = linkEl ? linkEl.value.trim() : '';
      const courseImage = imageEl ? imageEl.value.trim() : '';

      if (!courseTitle || !courseLink || !courseImage) {
        showError('Por favor, preencha todos os campos.');
        return;
      }

      if (!isValidUrl(courseLink) || !isValidUrl(courseImage)) {
        showError('O link do curso e a URL da imagem devem ser URLs válidas (http/https).');
        return;
      }

      if (!db) {
        showError('Banco de dados indisponível no momento.');
        return;
      }

      try {
        await db.collection('courses').add({
          title: courseTitle,
          link: courseLink,
          image: courseImage,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // feedback ao usuário
        if (titleEl) titleEl.value = '';
        if (linkEl) linkEl.value = '';
        if (imageEl) imageEl.value = '';
        fetchCourses(); // recarrega a lista
      } catch (error) {
        console.error('Erro ao adicionar curso:', error);
        showError('Erro ao adicionar curso. Tente novamente mais tarde.');
      }
    });
  })();

  // Buscar e exibir cursos
  async function fetchCourses() {
    const coursesContainer = document.getElementById('courses');
    if (!coursesContainer) return;

    // limpa o conteúdo e coloca uma mensagem de carregando
    coursesContainer.innerHTML = '<p class="loading">Carregando cursos...</p>';

    if (!db) {
      coursesContainer.innerHTML = '<p class="error-message">Banco de dados indisponível.</p>';
      return;
    }

    try {
      const snapshot = await db.collection('courses').orderBy('createdAt', 'desc').get();
      // constrói HTML com segurança
      const items = [];
      snapshot.forEach(doc => {
        const course = doc.data() || {};
        const image = isValidUrl(course.image) ? course.image : 'https://via.placeholder.com/400x225?text=Sem+imagem';
        const title = course.title ? String(course.title) : 'Curso sem título';
        const link = isValidUrl(course.link) ? course.link : '#';

        const card = document.createElement('div');
        card.className = 'course-card';

        const img = document.createElement('img');
        img.src = image;
        img.alt = title;
        img.loading = 'lazy';
        img.className = 'course-img';
        card.appendChild(img);

        const h3 = document.createElement('h3');
        h3.textContent = title;
        card.appendChild(h3);

        const a = document.createElement('a');
        a.href = link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = 'Acessar curso';
        card.appendChild(a);

        items.push(card);
      });

      // renderiza
      if (!items.length) {
        coursesContainer.innerHTML = '<p>Nenhum curso disponível no momento.</p>';
        return;
      }

      coursesContainer.innerHTML = ''; // limpa
      items.forEach(el => coursesContainer.appendChild(el));

    } catch (error) {
      console.error('Erro ao buscar cursos:', error);
      coursesContainer.innerHTML = '<p class="error-message">Erro ao carregar cursos. Tente novamente mais tarde.</p>';
    }
  }

  // Inicializa busca ao final (somente se DOM já carregado)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchCourses);
  } else {
    // já carregado
    fetchCourses();
  }

})();
