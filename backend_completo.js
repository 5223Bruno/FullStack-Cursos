/**
 * BACKEND COMPLETO PARA O SITE FullStackCursos
 */

// ============================================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es", // MANTENHA A SUA CHAVE ORIGINAL
  authDomain: "fullstack-cursos.firebaseapp.com",
  projectId: "fullstack-cursos",
  storageBucket: "fullstack-cursos.firebasestorage.app",
  messagingSenderId: "934193250493",
  appId: "1:934193250493:web:e4ecf68f0c5ce85739f7d4",
  measurementId: "G-6SW1JH0LX6"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const functions = firebase.functions();

// Adicionado { merge: true } para evitar aviso, embora timestampsInSnapshots seja geralmente padrão/obsoleto.
db.settings({ timestampsInSnapshots: true }, { merge: true });

// ============================================================================
// SISTEMA DE AUTENTICAÇÃO E USUÁRIOS
// ============================================================================
const AuthSystem = {
  currentUser: null,
  initAuthObserver: function() {
    auth.onAuthStateChanged(user => {
      this.currentUser = user; // Define currentUser aqui para acesso global no AuthSystem
      updateUserInterface(user); // Atualiza UI do header primeiro

      if (user) {
        console.log('[AuthObserver] Usuário detectado:', user.uid);
        this.getUserProfile(user.uid).then(profile => {
          console.log('[AuthObserver] Perfil obtido:', profile ? profile.name : 'Sem perfil Firestore');
          
          const currentHash = window.location.hash.substring(1);
          const userSections = ['dashboard', 'profile', 'my-courses', 'settings'];

          if (window.location.hash === '' || window.location.hash === '#home' || window.location.hash === '#login') {
            console.log('[AuthObserver] Usuário logado, redirecionando para #dashboard');
            window.location.hash = 'dashboard'; // Deixa o listener 'hashchange' do HTML cuidar da exibição
          } else if (userSections.includes(currentHash)) {
            // Se já está numa seção de usuário, o listener 'hashchange' já deve ter chamado a função de display.
            // Mas podemos chamar explicitamente para garantir dados atualizados após login.
            console.log('[AuthObserver] Usuário logado e em seção de usuário:', currentHash, '. Recarregando dados se necessário.');
            if (currentHash === 'dashboard' && typeof displayUserDashboard === 'function') displayUserDashboard();
            else if (currentHash === 'profile' && typeof displayUserProfile === 'function') displayUserProfile();
            else if (currentHash === 'my-courses' && typeof displayUserCourses === 'function') displayUserCourses();
            else if (currentHash === 'settings' && typeof displayUserSettings === 'function') displayUserSettings();
          }
        }).catch(error => {
            console.error("[AuthObserver] Erro ao buscar perfil Firestore no login:", error);
            // Mesmo com erro, o usuário está logado, AuthObserver já chamou updateUserInterface.
            // Se estiver no dashboard, tentar popular com dados do Auth.
            if (window.location.hash === '#dashboard' && typeof displayUserDashboard === 'function') {
                displayUserDashboard(); // Tenta popular com o que tem (dados do Auth)
            }
        });
      } else { // Nenhum usuário logado
        console.log('[AuthObserver] Nenhum usuário logado.');
        // updateUserInterface(null) já foi chamado no início do onAuthStateChanged.
        const currentHash = window.location.hash.substring(1);
        if (['dashboard', 'profile', 'my-courses', 'settings'].includes(currentHash)) {
            console.log('[AuthObserver] Usuário deslogou de seção protegida, redirecionando para #home');
            window.location.hash = 'home'; // Deixa o listener 'hashchange' do HTML cuidar
        }
      }
    });
  },
  loginWithGoogle: async function() {
    try {
      console.log('[AuthSystem.loginWithGoogle] Iniciando login com Google...');
      const provider = new firebase.auth.GoogleAuthProvider();
      const userCredential = await auth.signInWithPopup(provider);
      const user = userCredential.user;
      console.log('[AuthSystem.loginWithGoogle] Usuário Google:', user.displayName);

      const userDocRef = db.collection('users').doc(user.uid);
      const userDoc = await userDocRef.get();
      
      const userData = {
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        role: userDoc.exists && userDoc.data().role ? userDoc.data().role : 'student',
        courses: userDoc.exists && userDoc.data().courses ? userDoc.data().courses : [],
        completedLessons: userDoc.exists && userDoc.data().completedLessons ? userDoc.data().completedLessons : {},
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() 
      };

      if (!userDoc.exists) {
        console.log('[AuthSystem.loginWithGoogle] Novo usuário, criando perfil...');
        userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await userDocRef.set(userData);
      } else {
        console.log('[AuthSystem.loginWithGoogle] Usuário existente, atualizando perfil...');
        await userDocRef.update({ // Atualiza apenas nome/foto/último login
            name: user.displayName,
            photoURL: user.photoURL,
            lastLoginAt: userData.lastLoginAt
        });
      }
      return user;
    } catch (error) {
      console.error("[AuthSystem.loginWithGoogle] Erro:", error, "Código:", error.code);
      if (error.code === 'auth/popup-closed-by-user') {
        showCustomAlert('Login com Google cancelado.', 'error');
      } else if (error.code === 'auth/network-request-failed') {
        showCustomAlert('Falha de rede ao tentar logar com Google. Verifique sua conexão.', 'error');
      } else {
        showCustomAlert(`Erro no login com Google: ${error.message}`, 'error');
      }
      throw error; 
    }
  },
  logoutUser: async function() { 
      await auth.signOut();
      console.log('[AuthSystem.logoutUser] Usuário deslogado.');
      // O AuthObserver cuidará do redirecionamento e atualização da UI.
  },
  getUserProfile: async function(userId) {
    if (!userId) throw new Error("User ID não fornecido.");
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) return { id: userDoc.id, ...userDoc.data() };
      
      const authUser = AuthSystem.currentUser; // Usa o currentUser do AuthSystem
      if (authUser && authUser.uid === userId) {
        console.warn("[getUserProfile] Perfil Firestore não encontrado. Criando perfil básico.");
        const basicProfile = {
            id: userId, name: authUser.displayName, email: authUser.email, photoURL: authUser.photoURL,
            role: 'student', courses: [], completedLessons: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('users').doc(userId).set(basicProfile, { merge: true });
        return basicProfile;
      }
      throw new Error("Perfil de usuário não encontrado e sem usuário autenticado correspondente.");
    } catch (error) {
      console.error(`[getUserProfile] Erro ao obter perfil para ${userId}:`, error);
      throw error;
    }
  },
  // Manter outras funções como registerUser, resetPassword, updateUserProfile, isAdmin...
};

// ============================================================================
// SISTEMA DE GERENCIAMENTO DE CURSOS (Exemplo resumido)
// ============================================================================
const CourseSystem = {
  getFeaturedCourses: async function() { 
    // Simulação: Retornar cursos estáticos se não houver lógica de Firestore aqui
    console.log("[CourseSystem.getFeaturedCourses] Buscando cursos em destaque (simulado).");
    // Idealmente, buscaria do Firestore: db.collection('courses').where('featured', '==', true).limit(3).get()
    // Por ora, para não quebrar, retornamos os que estão no HTML ou um array vazio.
    // Se os cards são gerados dinamicamente por displayFeaturedCourses, ela precisa desses dados.
    // Se os cards são estáticos no HTML, esta função pode não ser estritamente necessária para a exibição inicial deles.
    // Para o propósito da busca, esta função precisaria buscar no Firestore.
    return [
        // Exemplo de dados que displayFeaturedCourses esperaria (adapte se necessário)
        // { id: 'logica', title: 'Lógica de Programação Avançada', description: '...', imageUrl: 'images/logica.png', price: 97, featured: true, averageRating: 0, numReviews: 0 },
        // { id: 'minicurso', title: 'Minicurso Programar do Zero', description: '...', imageUrl: 'images/minicurso.png', price: 120, featured: true, averageRating: 0, numReviews: 0 },
        // { id: 'python', title: 'Python Básico para Iniciantes', description: '...', imageUrl: 'images/python.png', price: 97, featured: true, averageRating: 0, numReviews: 0 },
    ]; 
  },
  searchCourses: async function(query) {
    console.log(`[CourseSystem.searchCourses] Buscando por: "${query}" no Firestore (simulado).`);
    if (!query) return [];
    // Lógica de busca real no Firestore:
    // const snapshot = await db.collection('courses')
    //   .where('keywords', 'array-contains', query.toLowerCase()) // Exemplo de busca por keywords
    //   .get();
    // ou buscar por título: .where('title_lowercase', '>=', query.toLowerCase()).where('title_lowercase', '<=', query.toLowerCase() + '\uf8ff')
    // const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // return courses;
    
    // Simulação para teste:
    const allCourses = [ // Simule alguns dados de curso aqui para teste da busca
        { id: 'logica', title: 'Lógica de Programação Avançada', description: 'Aprenda lógica...', imageUrl: 'images/logica.png', price: 97.00 },
        { id: 'python', title: 'Python para Iniciantes', description: 'Fundamentos de Python...', imageUrl: 'images/python.png', price: 147.00 },
        { id: 'webdev', title: 'Desenvolvimento Web Completo', description: 'Crie sites incríveis...', imageUrl: 'images/placeholder-course.jpg', price: 297.00 },
    ];
    return allCourses.filter(course => course.title.toLowerCase().includes(query.toLowerCase()) || course.description.toLowerCase().includes(query.toLowerCase()));
  },
  getBasicCourseInfo: async function(courseId) {
    try {
      const courseDoc = await db.collection('courses').doc(courseId).get();
      if (courseDoc.exists) {
        const data = courseDoc.data();
        return { id: courseDoc.id, title: data.title, imageUrl: data.imageUrl, description: data.description };
      }
      console.warn(`[getBasicCourseInfo] Curso com ID ${courseId} não encontrado.`);
      return null;
    } catch (error) {
      console.error("[getBasicCourseInfo] Erro:", courseId, error);
      throw error;
    }
  }
  // Outras funções do CourseSystem...
};

// ============================================================================
// FUNÇÕES PARA EXIBIR CONTEÚDO DAS SEÇÕES DO USUÁRIO
// ============================================================================
async function displayUserDashboard() {
    console.log("[displayUserDashboard] Exibindo painel.");
    const dashboardSection = document.getElementById('dashboard');
    if (!dashboardSection) return;
    
    const userNameEl = dashboardSection.querySelector('.user-name-placeholder');
    if (!AuthSystem.currentUser) {
        if(userNameEl) userNameEl.textContent = "Usuário";
        return;
    }
    if(userNameEl) userNameEl.textContent = AuthSystem.currentUser.displayName || "Usuário"; // Valor Padrão
    try {
        const userProfile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
        if (userNameEl && userProfile) {
            userNameEl.textContent = userProfile.name || AuthSystem.currentUser.displayName || "Usuário";
        }
    } catch (error) {
        console.error("[displayUserDashboard] Erro ao buscar perfil para dashboard (usando nome do Auth):", error);
    }
}

async function displayUserCourses() {
    console.log("[displayUserCourses] Exibindo Meus Cursos.");
    const container = document.getElementById('user-courses-container'); 
    if (!container) return;
    if (!AuthSystem.currentUser) {
        container.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Você precisa estar logado.</p>';
        return;
    }
    container.innerHTML = '<p class="text-light-tertiary col-span-full text-center animate-pulse">Carregando...</p>';
    try {
        const userProfile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
        const courseIds = userProfile.courses || [];
        if (courseIds.length === 0) {
            container.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Nenhum curso. <a href="#courses" class="text-accent-indigo-primary hover:underline">Explore!</a></p>';
            return;
        }
        let html = '';
        for (const id of courseIds) {
            const course = await CourseSystem.getBasicCourseInfo(id);
            if (course) {
                const hotmartLink = `https://pay.hotmart.com/SEU_PRODUCT_ID?checkoutMode=X&핫딜=${id}`; // Placeholder
                html += `
                    <div class="course-card ..."><img src="${course.imageUrl || '...jpg'}"...><div class="p-6 ...">
                        <h4 class="...">${course.title || 'N/A'}</h4><p class="...">${course.description ? course.description.substring(0,100)+'...' : '...'}</p>
                        <a href="${hotmartLink}" target="_blank" class="...cta-button">Assistir <i class="fas fa-external-link-alt ml-1"></i></a>
                    </div></div>`;
            }
        }
        container.innerHTML = html || '<p class="col-span-full text-center">Nenhum curso para exibir.</p>';
        if (typeof initLazyLoading === "function") initLazyLoading();
    } catch (error) {
        console.error("[displayUserCourses] Erro:", error);
        container.innerHTML = '<p class="text-red-500 col-span-full text-center">Erro ao carregar cursos.</p>';
    }
}

async function displayUserProfile() {
    console.log("[displayUserProfile] Exibindo Perfil.");
    const contentEl = document.getElementById('user-profile-content');
    if (!contentEl) return;
    if (!AuthSystem.currentUser) {
        contentEl.innerHTML = '<p class="text-light-tertiary">Você precisa estar logado.</p>';
        return;
    }
    contentEl.innerHTML = '<p class="text-light-tertiary animate-pulse">Carregando perfil...</p>';
    try {
        const user = AuthSystem.currentUser;
        const profile = await AuthSystem.getUserProfile(user.uid);
        const joinDate = profile.createdAt && profile.createdAt.seconds ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        contentEl.innerHTML = `
            <div class="flex ..."><img src="${profile.photoURL || user.photoURL || '...'}" ... class="w-32 h-32 ...">
                <div><h3 class="...">${profile.name || user.displayName}</h3><p class="...">${profile.email || user.email}</p><p class="...">Membro desde: ${joinDate}</p></div>
            </div>
            <div class="space-y-6"><div><label ...>Sobre Mim (em breve)</label><textarea ... disabled></textarea></div>
            <button ... disabled>Salvar (em breve)</button></div>`;
    } catch (error) {
        console.error("[displayUserProfile] Erro:", error);
        contentEl.innerHTML = '<p class="text-red-500">Erro ao carregar perfil.</p>';
    }
}

async function displayUserSettings() {
    console.log("[displayUserSettings] Exibindo Configurações.");
    const contentEl = document.getElementById('user-settings-content');
    if (!contentEl || !AuthSystem.currentUser) return;

    // Conteúdo é estático no HTML, apenas anexa o listener ao botão
    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
        const newDeleteBtn = deleteBtn.cloneNode(true); // Remove listeners antigos
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.onclick = async () => {
            if (confirm("Tem certeza que deseja excluir sua conta? Esta ação é irreversível.")) {
                if (confirm("Confirmação final: Realmente deseja excluir?")) {
                    try {
                        showCustomAlert("Funcionalidade de exclusão pendente.", "error");
                        // Lógica de exclusão: await AuthSystem.currentUser.delete(); etc.
                    } catch (err) { showCustomAlert("Erro ao excluir: " + err.message, "error"); }
                }
            }
        };
    } else { console.warn("[displayUserSettings] Botão 'delete-account-btn' não encontrado."); }
}


// ============================================================================
// BOTÃO DE LOGIN DO GOOGLE
// ============================================================================
function setupGoogleLoginButton() {
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', function() {
      console.log('[googleLoginBtn.onClick] Botão Google clicado.');
      AuthSystem.loginWithGoogle()
        .then(user => showCustomAlert(`Login como ${user.displayName} bem-sucedido!`, 'success'))
        .catch(err => { /* Erro já tratado dentro de loginWithGoogle e AuthObserver */ });
    });
  }
}

// ============================================================================
// INICIALIZAÇÃO E EVENTOS PRINCIPAIS
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log("[DOMContentLoaded] Inicializando sistemas...");
  AuthSystem.initAuthObserver();
  
  if (typeof PaymentSystem !== 'undefined' && PaymentSystem.init) PaymentSystem.init();
  
  if (document.getElementById('featured-courses') && typeof CourseSystem !== 'undefined' && CourseSystem.getFeaturedCourses && typeof displayFeaturedCourses === 'function') {
    CourseSystem.getFeaturedCourses()
      .then(courses => {
          if (courses && courses.length > 0) displayFeaturedCourses(courses);
          else console.log("Nenhum curso em destaque retornado para exibição.");
      })
      .catch(error => console.error("Erro ao carregar cursos em destaque:", error));
  }
  
  if (typeof setupGoogleLoginButton === 'function') setupGoogleLoginButton();
  if (typeof setupCourseSearch === 'function') setupCourseSearch(); 
});

// ============================================================================
// FUNÇÕES DE UI GLOBAIS
// ============================================================================
function displayFeaturedCourses(courses) {
  const container = document.getElementById('featured-courses'); 
  if (!container) {
      console.warn("[displayFeaturedCourses] Container #featured-courses não encontrado.");
      return;
  }
  // Se os cards já estão no HTML, esta função pode ser para preenchê-los, não para criar novos.
  // Se os cards devem ser gerados dinamicamente, o HTML não deve ter os cards estáticos DENTRO de #featured-courses.
  // Assumindo que os cards no HTML são placeholders e que esta função os SUBSTITUI:
  container.innerHTML = ''; 
  
  courses.forEach(course => {
    const el = document.createElement('div');
    el.className = 'course-card rounded-xl shadow-lg overflow-hidden flex flex-col animate-on-scroll'; 
    el.innerHTML = `
      <img src="${course.imageUrl || 'images/placeholder-course.jpg'}" alt="${course.title || 'Curso'}" class="w-full h-48 object-cover lazy-load">
      <div class="p-6 flex flex-col flex-grow">
        <h3 class="text-xl font-semibold mb-2 text-light-primary">${course.title || 'Título Indisponível'}</h3>
        <p class="text-light-tertiary mb-4 text-sm flex-grow">${course.description ? course.description.substring(0,100)+'...' : 'Descrição não disponível.'}</p>
        <div class="mb-4">${course.featured ? '<span class="text-xs ...">Em Destaque</span>' : ''}</div>
        <div class="flex justify-between items-center mb-3">
          <p class="text-lg font-bold text-accent-indigo-primary">R$ ${course.price ? Number(course.price).toFixed(2) : 'N/A'}</p>
          <span class="text-sm text-light-tertiary"><i class="fas fa-star ..."></i> ${course.averageRating ? Number(course.averageRating).toFixed(1) : '0.0'} (${course.numReviews || 0})</span>
        </div>
        <a href="#detail-${course.id}" class="... cta-button">Ver Detalhes</a>
      </div>`;
    container.appendChild(el);
  });
  if (typeof initScrollAnimations === "function") initScrollAnimations(); 
  if (typeof initLazyLoading === "function") initLazyLoading(); 
}

function setupCourseSearch() {
    const form = document.getElementById('course-search-form');
    const resultsSection = document.getElementById('search-results');
    const resultsContainer = document.getElementById('search-results-container');
    const titleEl = document.getElementById('search-results-title');
    const noResultsEl = document.getElementById('no-search-results');

    if (!form || !resultsSection || !resultsContainer || !titleEl || !noResultsEl) {
        console.warn("Elementos da busca não encontrados."); return;
    }

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const query = form.query.value.trim();
        if (!query) { showCustomAlert("Digite algo para buscar.", "error"); return; }

        titleEl.textContent = `Resultados para: "${query}"`;
        resultsContainer.innerHTML = '<p class="animate-pulse col-span-full text-center">Buscando...</p>';
        resultsSection.style.display = 'block';
        noResultsEl.style.display = 'none';

        try {
            const courses = await CourseSystem.searchCourses(query);
            displaySearchResults(courses, query); // Chama a função dedicada
        } catch (error) {
            console.error("Erro na busca:", error);
            resultsContainer.innerHTML = '<p class="text-red-500 col-span-full text-center">Erro na busca.</p>';
        }
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
}

function displaySearchResults(courses, query) {
    const resultsContainer = document.getElementById('search-results-container');
    const noResultsEl = document.getElementById('no-search-results');
    
    resultsContainer.innerHTML = '';
    if (!courses || courses.length === 0) {
        noResultsEl.style.display = 'block';
        return;
    }
    noResultsEl.style.display = 'none';

    courses.forEach(course => { // Adapte o HTML do card conforme necessário
        const el = document.createElement('div');
        el.className = 'course-card ...'; // Classes do seu card
        el.innerHTML = `
            <img src="${course.imageUrl || 'images/placeholder-course.jpg'}" alt="${course.title}" class="w-full h-48 object-cover lazy-load">
            <div class="p-6 ...">
                <h3 class="text-xl ...">${course.title}</h3>
                <p class="text-sm ...">${course.description ? course.description.substring(0, 100) + '...' : ''}</p>
                <a href="#detail-${course.id}" class="... cta-button">Ver Detalhes</a>
            </div>`;
        resultsContainer.appendChild(el);
    });
    if (typeof initLazyLoading === "function") initLazyLoading();
    if (typeof initScrollAnimations === "function") initScrollAnimations();
}


// ============================================================================
// ATUALIZAÇÃO DA UI DO HEADER (Login/Logout, Menu do Usuário)
// ============================================================================
function updateUserInterface(user) {
  const desktopAuthSection = document.getElementById('user-auth-section-desktop');
  const mobileAuthSection = document.getElementById('user-auth-section-mobile');

  if (desktopAuthSection) desktopAuthSection.innerHTML = '';
  if (mobileAuthSection) mobileAuthSection.innerHTML = '';

  if (user) {
    const userName = user.displayName || (user.email ? user.email.split('@')[0] : "Usuário");
    const userPhoto = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=4f46e5&color=fff&length=1`;

    if (desktopAuthSection) {
        desktopAuthSection.innerHTML = `
            <div class="relative group">
                <button type="button" class="flex items-center cursor-pointer focus:outline-none">
                    <img src="${userPhoto}" alt="Perfil" class="w-10 h-10 rounded-full border-2 border-accent-indigo-primary mr-2 object-cover">
                    <span class="text-light-primary hidden lg:inline">${userName}</span>
                    <i class="fas fa-chevron-down text-light-secondary ml-2 hidden lg:inline group-hover:rotate-180 transition-transform"></i>
                </button>
                <div class="hidden group-focus-within:block group-hover:block absolute right-0 top-full mt-2 w-60 bg-dark-card rounded-lg shadow-xl z-[100] py-2 border border-gray-700 neon-border">
                    <div class="px-4 py-3 border-b border-gray-700"><p class="text-sm ... font-semibold truncate">${userName}</p><p class="text-xs ... truncate">${user.email||''}</p></div>
                    <a href="#dashboard" class="flex ..."><i class="fas fa-tachometer-alt ..."></i>Painel</a>
                    <a href="#profile" class="flex ..."><i class="fas fa-user ..."></i>Meu Perfil</a>
                    <a href="#my-courses" class="flex ..."><i class="fas fa-graduation-cap ..."></i>Meus Cursos</a>
                    <a href="#settings" class="flex ..."><i class="fas fa-cog ..."></i>Configurações</a>
                    <div class="border-t ... my-1"></div>
                    <a href="#" id="logout-button-desktop" class="flex ..."><i class="fas fa-sign-out-alt ..."></i>Sair</a>
                </div>
            </div>`;
        const logoutBtn = desktopAuthSection.querySelector('#logout-button-desktop');
        if (logoutBtn) logoutBtn.addEventListener('click', e => { e.preventDefault(); AuthSystem.logoutUser().then(() => showCustomAlert('Logout bem-sucedido!', 'success')); });
    }

    if (mobileAuthSection) {
        mobileAuthSection.innerHTML = `
            <div class="px-6 py-4 bg-dark-tertiary border-b ..."><div class="flex items-center"><img src="${userPhoto}" alt="Perfil" class="w-10 h-10 ..."><p class="...">${userName}</p></div></div>
            <a href="#dashboard" class="block ..."><i class="fas fa-tachometer-alt ..."></i> Painel</a>
            <a href="#profile" class="block ..."><i class="fas fa-user ..."></i> Meu Perfil</a>
            <a href="#my-courses" class="block ..."><i class="fas fa-graduation-cap ..."></i> Meus Cursos</a>
            <a href="#settings" class="block ..."><i class="fas fa-cog ..."></i> Configurações</a>
            <a href="#" id="logout-button-mobile" class="block ..."><i class="fas fa-sign-out-alt ..."></i> Sair</a>`;
        const logoutBtnMobile = mobileAuthSection.querySelector('#logout-button-mobile');
        if (logoutBtnMobile) logoutBtnMobile.addEventListener('click', e => { e.preventDefault(); AuthSystem.logoutUser().then(() => showCustomAlert('Logout bem-sucedido!', 'success')); });
    }
  } else { 
    if (desktopAuthSection) desktopAuthSection.innerHTML = `<a href="#login" class="gradient-cta ...">Login</a>`;
    if (mobileAuthSection) mobileAuthSection.innerHTML = `<a href="#login" class="block ... gradient-cta ...">Login</a>`;
  }
}

// EXPORTS
window.FullStackCursosAuth = AuthSystem;
window.FullStackCursosCourses = CourseSystem;
// ... outros sistemas se necessário
