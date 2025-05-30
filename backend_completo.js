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

db.settings({ timestampsInSnapshots: true });

// ============================================================================
// SISTEMA DE AUTENTICAÇÃO E USUÁRIOS
// ============================================================================
const AuthSystem = {
  currentUser: null,
  initAuthObserver: function() {
    auth.onAuthStateChanged(user => {
      if (user) {
        this.currentUser = user;
        console.log('[AuthObserver] Usuário detectado:', user.uid);
        this.getUserProfile(user.uid).then(profile => {
          console.log('[AuthObserver] Perfil obtido:', profile);
          updateUserInterface(user); // Chama a função global de UI
          // Atualiza o placeholder do nome no dashboard se ele existir
          const userNameDashboardEl = document.querySelector('#dashboard .user-name-placeholder');
          if (userNameDashboardEl && profile) {
              userNameDashboardEl.textContent = profile.name || user.displayName || "Usuário";
          }
          // Se o usuário está logado e não há hash ou é #home, redireciona para #dashboard
          if(window.location.hash === '' || window.location.hash === '#home' || window.location.hash === '#login') {
            console.log('[AuthObserver] Redirecionando para #dashboard');
            window.location.href = '#dashboard';
          } else {
            // Se já existe um hash para uma seção de usuário, tenta revalidar/recarregar
            // A lógica de clique simulado pode ser conflituosa com o roteador do HTML.
            // Considerar chamar as funções display diretamente se necessário, ou deixar o roteador HTML cuidar.
            const currentHash = window.location.hash.substring(1);
            if (['dashboard', 'profile', 'my-courses', 'settings'].includes(currentHash)) {
                const targetLink = document.querySelector(`a[href="${window.location.hash}"]`);
                if (targetLink && typeof targetLink.click === 'function') {
                     // console.log('[AuthObserver] Tentando simular clique para recarregar seção:', window.location.hash);
                     // targetLink.click(); // Simula clique para re-renderizar - PODE CAUSAR PROBLEMAS, OBSERVAR
                } else {
                    // Se não há link, mas o hash corresponde a uma função de display, chamá-la.
                    // Isso pode ser mais seguro que simular clique.
                    if (currentHash === 'dashboard' && typeof displayUserDashboard === 'function') displayUserDashboard();
                    else if (currentHash === 'profile' && typeof displayUserProfile === 'function') displayUserProfile();
                    else if (currentHash === 'my-courses' && typeof displayUserCourses === 'function') displayUserCourses();
                    else if (currentHash === 'settings' && typeof displayUserSettings === 'function') displayUserSettings();
                }
            }
          }
        }).catch(error => {
            console.error("[AuthObserver] Erro ao buscar perfil para UI:", error);
            updateUserInterface(user); // Fallback com dados do Auth
        });
      } else {
        this.currentUser = null;
        console.log('[AuthObserver] Nenhum usuário logado.');
        updateUserInterface(null); // Chama a função global de UI
        const userNameDashboardEl = document.querySelector('#dashboard .user-name-placeholder');
        if (userNameDashboardEl) {
            userNameDashboardEl.textContent = "Usuário"; // Reset placeholder
        }
        // Se o usuário deslogou e estava em uma seção protegida, redireciona para #home
        const currentHash = window.location.hash.substring(1);
        if (['dashboard', 'profile', 'my-courses', 'settings'].includes(currentHash)) {
            window.location.href = '#home';
        }
      }
    });
  },
  registerUser: async function(name, email, password) { /* ... (código original mantido) ... */ },
  loginUser: async function(email, password) { /* ... (código original mantido) ... */ },
  loginWithGoogle: async function() {
    try {
      console.log('[AuthSystem.loginWithGoogle] Iniciando login com Google via Firebase...');
      const provider = new firebase.auth.GoogleAuthProvider();
      const userCredential = await auth.signInWithPopup(provider);
      const user = userCredential.user;
      console.log('[AuthSystem.loginWithGoogle] Usuário retornado pelo Google:', user);

      const userDocRef = db.collection('users').doc(user.uid);
      const userDoc = await userDocRef.get();
      
      if (!userDoc.exists) {
        console.log('[AuthSystem.loginWithGoogle] Usuário novo, criando perfil no Firestore...');
        await userDocRef.set({
          name: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          role: 'student',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          courses: [],
          completedLessons: {}
        });
        console.log('[AuthSystem.loginWithGoogle] Perfil criado para:', user.displayName);
      } else {
        console.log('[AuthSystem.loginWithGoogle] Usuário já existe:', user.displayName);
        await userDocRef.update({ // Atualiza nome/foto caso tenham mudado no Google
            name: user.displayName,
            photoURL: user.photoURL 
        });
        console.log('[AuthSystem.loginWithGoogle] Perfil atualizado para:', user.displayName);
      }
      return user; // Retorna o objeto user
    } catch (error) {
      console.error("[AuthSystem.loginWithGoogle] Erro dentro da função:", error, "Código:", error.code);
      throw error; 
    }
  },
  logoutUser: async function() { 
      await auth.signOut(); // Código original mantido, mas o reload na updateUserInterface já cuida da UI
      console.log('[AuthSystem.logoutUser] Usuário deslogado.');
      // A lógica de redirecionamento agora está no AuthObserver
  },
  resetPassword: async function(email) { /* ... (código original mantido) ... */ },
  getUserProfile: async function(userId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        return { id: userDoc.id, ...userDoc.data() };
      } else {
        const currentUser = auth.currentUser; // Usar o auth.currentUser mais recente
        if(currentUser && currentUser.uid === userId){
            console.warn("[getUserProfile] Perfil não encontrado no Firestore para usuário Google. Usando dados do Auth e criando perfil básico.");
            const basicProfile = {
                id: userId,
                name: currentUser.displayName,
                email: currentUser.email,
                photoURL: currentUser.photoURL,
                role: 'student',
                courses: [],
                completedLessons: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp() // Adicionar timestamp de criação
            };
            // Tenta criar o perfil se não existir
            await db.collection('users').doc(userId).set(basicProfile, { merge: true });
            return basicProfile;
        }
        console.error("[getUserProfile] Perfil de usuário não encontrado e não há usuário logado correspondente.");
        throw new Error("Perfil de usuário não encontrado");
      }
    } catch (error) {
      console.error("[getUserProfile] Erro ao obter perfil:", error);
      throw error;
    }
  },
  updateUserProfile: async function(userId, profileData) { /* ... (código original mantido) ... */ },
  isAdmin: async function(userId) { /* ... (código original mantido) ... */ }
};

// ============================================================================
// SISTEMA DE GERENCIAMENTO DE CURSOS (Seu código original)
// ============================================================================
const CourseSystem = {
  getAllCourses: async function() { /* ... seu código original ... */ },
  getFeaturedCourses: async function() { /* ... seu código original ... */ },
  getCourseDetails: async function(courseId) { /* ... seu código original ... */ },
  addCourse: async function(courseData) { /* ... seu código original ... */ },
  updateCourse: async function(courseId, courseData) { /* ... seu código original ... */ },
  addModule: async function(courseId, moduleData) { /* ... seu código original ... */ },
  addLesson: async function(courseId, moduleId, lessonData) { /* ... seu código original ... */ },
  uploadLessonVideo: async function(courseId, moduleId, lessonId, videoFile) { /* ... seu código original ... */ },
  markLessonAsCompleted: async function(courseId, moduleId, lessonId) { /* ... seu código original ... */ },
  isLessonCompleted: async function(courseId, moduleId, lessonId) { /* ... seu código original ... */ },
  getCourseProgress: async function(courseId) { /* ... seu código original ... */ },
  searchCourses: async function(query) { /* ... seu código original ... */ },
  getBasicCourseInfo: async function(courseId) {
    try {
      const courseDoc = await db.collection('courses').doc(courseId).get();
      if (courseDoc.exists) {
        const data = courseDoc.data();
        return {
          id: courseDoc.id,
          title: data.title,
          imageUrl: data.imageUrl,
          description: data.description 
        };
      }
      console.warn(`[getBasicCourseInfo] Curso com ID ${courseId} não encontrado.`);
      return null;
    } catch (error) {
      console.error("[getBasicCourseInfo] Erro ao obter informações básicas do curso:", courseId, error);
      throw error;
    }
  }
};

// ============================================================================
// SISTEMA DE PAGAMENTOS (Seu código original)
// ============================================================================
const PaymentSystem = { /* ... seu código original ... */ };
// ============================================================================
// SISTEMA DE ADMINISTRAÇÃO (Seu código original)
// ============================================================================
const AdminSystem = { /* ... seu código original ... */ };
// ============================================================================
// SISTEMA DE NOTIFICAÇÕES (Seu código original)
// ============================================================================
const NotificationSystem = { /* ... seu código original ... */ };
// ============================================================================
// SISTEMA DE AVALIAÇÕES E COMENTÁRIOS (Seu código original)
// ============================================================================
const ReviewSystem = { /* ... seu código original ... */ };
// ============================================================================
// SISTEMA DE CERTIFICADOS (Seu código original)
// ============================================================================
const CertificateSystem = { /* ... seu código original ... */ };

// ============================================================================
// NOVAS FUNÇÕES PARA EXIBIR CONTEÚDO DAS SEÇÕES DO USUÁRIO
// ============================================================================
async function displayUserDashboard() {
    console.log("[displayUserDashboard] Tentando exibir painel.");
    const dashboardSection = document.getElementById('dashboard');
    if (!dashboardSection) {
        console.error("[displayUserDashboard] Seção #dashboard não encontrada.");
        return;
    }
    // A seção já deve estar visível pelo roteador do HTML antes desta função ser chamada.
    // Esta função foca em popular o conteúdo dinâmico.
    if (AuthSystem.currentUser) {
        try {
            const userProfile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
            const userNameEl = dashboardSection.querySelector('.user-name-placeholder');
            if (userNameEl && userProfile) {
                userNameEl.textContent = userProfile.name || AuthSystem.currentUser.displayName || "Usuário";
            } else if (userNameEl) {
                userNameEl.textContent = AuthSystem.currentUser.displayName || "Usuário"; // Fallback
            }
        } catch (error) {
            console.error("[displayUserDashboard] Erro ao buscar perfil para dashboard:", error);
            const userNameEl = dashboardSection.querySelector('.user-name-placeholder');
            if(userNameEl && AuthSystem.currentUser) userNameEl.textContent = AuthSystem.currentUser.displayName || "Usuário";
        }
    } else {
        // Se não há usuário, o AuthObserver deveria ter redirecionado.
        // Mas por segurança, podemos limpar o nome aqui.
        const userNameEl = dashboardSection.querySelector('.user-name-placeholder');
        if (userNameEl) userNameEl.textContent = "Usuário";
    }
}

async function displayUserCourses() {
    console.log("[displayUserCourses] Tentando exibir Meus Cursos.");
    const myCoursesSection = document.getElementById('my-courses');
    const coursesContainer = document.getElementById('user-courses-container'); 
    if (!myCoursesSection || !coursesContainer) {
        console.error("[displayUserCourses] Elementos da seção 'Meus Cursos' não encontrados.");
        return;
    }

    if (!AuthSystem.currentUser) {
        coursesContainer.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Você precisa estar logado para ver seus cursos.</p>';
        return;
    }

    try {
        coursesContainer.innerHTML = '<p class="text-light-tertiary col-span-full text-center animate-pulse">Carregando seus cursos...</p>';
        const userProfile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
        const courseIds = userProfile.courses || [];
        console.log("[displayUserCourses] IDs dos cursos do usuário:", courseIds);

        if (courseIds.length === 0) {
            coursesContainer.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Você ainda não está matriculado em nenhum curso. <a href="#courses" class="text-accent-indigo-primary hover:underline">Explore nossos cursos!</a></p>';
            return;
        }

        let coursesHTML = '';
        for (const courseId of courseIds) {
            try {
                const course = await CourseSystem.getBasicCourseInfo(courseId);
                if (course) {
                    console.log("[displayUserCourses] Detalhes do curso:", course.title);
                    // ATENÇÃO: VOCÊ PRECISA SUBSTITUIR ESTE LINK POR UM REAL OU UMA LÓGICA PARA GERÁ-LO
                    const hotmartLink = `https://pay.hotmart.com/SEU_PRODUCT_ID?checkoutMode=X&offDiscount=SEU_CUPOM&핫딜=${courseId}`; // Placeholder
                    coursesHTML += `
                        <div class="course-card bg-dark-card rounded-xl shadow-lg overflow-hidden flex flex-col neon-border">
                            <img src="${course.imageUrl || 'images/placeholder-course.jpg'}" alt="${course.title || 'Título do Curso'}" class="w-full h-48 object-cover lazy-load">
                            <div class="p-6 flex flex-col flex-grow">
                                <h4 class="text-xl font-semibold mb-2 text-light-primary">${course.title || 'Título Indisponível'}</h4>
                                <p class="text-light-tertiary text-sm mb-4 flex-grow">${course.description ? course.description.substring(0,100)+'...' : 'Acesse para saber mais sobre este curso.'}</p>
                                <a href="${hotmartLink}" target="_blank" class="mt-auto block w-full text-center bg-accent-emerald-primary hover:bg-accent-emerald-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">
                                    Assistir na Hotmart <i class="fas fa-external-link-alt ml-1"></i>
                                </a>
                            </div>
                        </div>
                    `;
                } else {
                     coursesHTML += `<div class="bg-dark-card rounded-lg p-4 text-red-400 col-span-full">Informações do curso ID ${courseId} não encontradas.</div>`;
                }
            } catch (courseError) {
                console.error("[displayUserCourses] Erro ao buscar detalhes do curso:", courseId, courseError);
                coursesHTML += `<div class="bg-dark-card rounded-lg p-4 text-red-400 col-span-full">Não foi possível carregar o curso ID: ${courseId}.</div>`;
            }
        }
        coursesContainer.innerHTML = coursesHTML || '<p class="text-light-tertiary col-span-full text-center">Nenhum curso para exibir.</p>';
        if (typeof initLazyLoading === "function") initLazyLoading(); // Re-inicializa lazy loading
    } catch (error) {
        console.error("[displayUserCourses] Erro ao exibir cursos do usuário:", error);
        coursesContainer.innerHTML = '<p class="text-red-500 col-span-full text-center">Ocorreu um erro ao carregar seus cursos. Tente novamente mais tarde.</p>';
    }
}

async function displayUserProfile() {
    console.log("[displayUserProfile] Tentando exibir Perfil.");
    const profileSection = document.getElementById('profile');
    const profileContent = document.getElementById('user-profile-content');
    if (!profileSection || !profileContent) {
        console.error("[displayUserProfile] Elementos da seção #profile não encontrados.");
        return;
    }

    if (!AuthSystem.currentUser) {
        profileContent.innerHTML = '<p class="text-light-tertiary">Você precisa estar logado para ver seu perfil.</p>';
        return;
    }
    try {
        profileContent.innerHTML = '<p class="text-light-tertiary animate-pulse">Carregando seu perfil...</p>';
        const user = AuthSystem.currentUser;
        const userProfileData = await AuthSystem.getUserProfile(user.uid);
        console.log("[displayUserProfile] Dados do perfil:", userProfileData);

        profileContent.innerHTML = `
            <div class="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 mb-8">
                <img src="${userProfileData.photoURL || user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userProfileData.name || user.email) + '&background=4f46e5&color=fff&size=128'}" 
                     alt="Foto de perfil" 
                     class="w-32 h-32 rounded-full border-4 border-accent-indigo-primary object-cover">
                <div>
                    <h3 class="text-3xl font-bold text-light-primary">${userProfileData.name || user.displayName}</h3>
                    <p class="text-accent-indigo-text text-lg">${userProfileData.email || user.email}</p>
                    <p class="text-sm text-light-tertiary mt-1">Membro desde: ${userProfileData.createdAt && userProfileData.createdAt.seconds ? new Date(userProfileData.createdAt.seconds * 1000).toLocaleDateString() : 'Data indisponível'}</p>
                </div>
            </div>
            <div class="space-y-6">
                <div>
                    <label for="profile-bio" class="block text-sm font-medium text-light-secondary mb-1">Sobre Mim (em breve)</label>
                    <textarea id="profile-bio" class="w-full bg-dark-tertiary border border-gray-700 rounded-lg py-2 px-4 text-light-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo-primary" rows="3" placeholder="Conte um pouco sobre você e seus interesses na área de tecnologia..." disabled></textarea>
                </div>
                <button class="bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button opacity-50 cursor-not-allowed" disabled>
                    Salvar Alterações (em breve)
                </button>
            </div>
        `;
    } catch (error) {
        console.error("[displayUserProfile] Erro ao exibir perfil do usuário:", error);
        profileContent.innerHTML = '<p class="text-red-500">Ocorreu um erro ao carregar seu perfil.</p>';
    }
}

async function displayUserSettings() {
    console.log("[displayUserSettings] Tentando exibir Configurações.");
    const settingsSection = document.getElementById('settings'); // Garante que a seção existe
    const settingsContent = document.getElementById('user-settings-content'); // Onde o conteúdo dinâmico (se houver) iria
    
    if (!settingsSection || !settingsContent) {
        console.error("[displayUserSettings] Elementos da seção #settings não encontrados.");
        return;
    }

    if (!AuthSystem.currentUser) {
        // O HTML já deve ter um placeholder para "Carregando...", mas podemos adicionar um se necessário.
        // Normalmente, o roteador do HTML e o AuthObserver impediriam de chegar aqui sem usuário.
        settingsContent.innerHTML = '<p class="text-light-tertiary">Você precisa estar logado para ver as configurações.</p>';
        return;
    }
    
    // CORREÇÃO: Limpar o placeholder "Carregando configurações..." se ele existir, pois o HTML já tem o conteúdo.
    const loadingPlaceholder = settingsContent.querySelector('p.text-light-secondary');
    if(loadingPlaceholder && loadingPlaceholder.textContent.includes('Carregando configurações...')) {
      loadingPlaceholder.remove(); // Remove o parágrafo de carregamento
    }
    // O restante do conteúdo da seção de configurações é estático no HTML.
    // Apenas precisamos garantir que o listener do botão de exclusão seja anexado.

    const deleteBtn = document.getElementById('delete-account-btn'); // ID corrigido no HTML
    if (deleteBtn) {
        // Remover listener antigo para evitar duplicação se a função for chamada múltiplas vezes
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);

        newDeleteBtn.onclick = async () => { // Adiciona ao botão clonado
            if (confirm("Tem certeza que deseja excluir sua conta? Esta ação é irreversível e todos os seus dados e acesso aos cursos serão perdidos.")) {
                if (confirm("Confirmação final: Realmente deseja excluir sua conta?")) {
                    try {
                        // Aqui você implementaria a lógica de exclusão no Firebase
                        // await AuthSystem.currentUser.delete(); // CUIDADO: Isso deleta o usuário do Auth
                        // Em seguida, deletar dados do Firestore e Storage associados
                        showCustomAlert("Funcionalidade de exclusão de conta ainda não implementada completamente.", "error");
                        console.log("Tentativa de exclusão de conta (não implementado).");
                    } catch (error) {
                        console.error("Erro ao tentar excluir conta:", error);
                        showCustomAlert("Erro ao excluir conta: " + error.message, "error");
                    }
                }
            }
        };
    } else {
        console.warn("[displayUserSettings] Botão 'delete-account-btn' não encontrado.");
    }
}


// ============================================================================
// NOVA FUNÇÃO PARA CONFIGURAR O BOTÃO DE LOGIN DO GOOGLE
// ============================================================================
function setupGoogleLoginButton() {
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    console.log('[setupGoogleLoginButton] Configurando listener para o botão google-login-btn');
    googleLoginBtn.addEventListener('click', function() {
      console.log('[googleLoginBtn.onClick] Botão "Acessar com Google" CLICADO!');
      AuthSystem.loginWithGoogle()
        .then((loggedInUser) => { 
          showCustomAlert('Login com Google realizado com sucesso!', 'success');
          // O AuthObserver já deve lidar com o redirecionamento para #dashboard
          // window.location.href = '#dashboard'; 
        })
        .catch(error => {
          console.error("[googleLoginBtn.onClick] Erro detalhado no login com Google:", error, "Código:", error.code);
          showCustomAlert(`Erro no login com Google: ${error.message} (Código: ${error.code})`, 'error');
        });
    });
  } else {
    console.error('[setupGoogleLoginButton] Botão google-login-btn não encontrado no DOM.');
  }
}

// ============================================================================
// INICIALIZAÇÃO E EVENTOS
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log("[DOMContentLoaded] Evento disparado. Inicializando sistemas...");
  AuthSystem.initAuthObserver(); // Esta função agora é a principal fonte de verdade para o estado de auth e UI do header.
  
  if (typeof PaymentSystem !== 'undefined' && PaymentSystem.init) {
    PaymentSystem.init();
  }
  
  if (document.getElementById('featured-courses') && typeof CourseSystem !== 'undefined' && CourseSystem.getFeaturedCourses) {
    CourseSystem.getFeaturedCourses()
      .then(courses => {
        if (typeof displayFeaturedCourses === 'function') {
            displayFeaturedCourses(courses);
        } else {
            console.warn("displayFeaturedCourses não definida globalmente, mas esperada.")
        }
      })
      .catch(error => {
        console.error("Erro ao carregar cursos em destaque:", error);
      });
  }
  
  if (typeof setupGoogleLoginButton === 'function') {
    setupGoogleLoginButton();
  } else {
    console.error("setupGoogleLoginButton não está definida.");
  }
  
  if (typeof setupContactForm === 'function') setupContactForm(); 
  if (typeof setupCourseSearch === 'function') setupCourseSearch(); 
});

// ============================================================================
// Funções de UI Globais (MANTENHA AS QUE VOCÊ JÁ TINHA NO SEU ARQUIVO ORIGINAL)
// ============================================================================
function displayFeaturedCourses(courses) {
  const container = document.getElementById('featured-courses'); 
  if (!container) {
      return;
  }
  container.innerHTML = '';
  courses.forEach(course => {
    const courseElement = document.createElement('div');
    courseElement.className = 'course-card rounded-xl shadow-lg overflow-hidden flex flex-col animate-on-scroll'; 
    courseElement.innerHTML = `
      <img src="${course.imageUrl || 'https://placehold.co/600x400/3498db/ffffff?text=Curso'}" 
           alt="${course.title}" 
           class="w-full h-48 object-cover lazy-load">
      <div class="p-6 flex flex-col flex-grow">
        <h3 class="text-xl font-semibold mb-2 text-light-primary">${course.title}</h3>
        <p class="text-light-tertiary mb-4 text-sm flex-grow">${course.description}</p>
        <div class="mb-4">
          ${course.featured ? '<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-accent-indigo-text bg-accent-indigo-primary bg-opacity-20">Em Destaque</span>' : ''}
        </div>
        <div class="flex justify-between items-center mb-3">
          <p class="text-lg font-bold text-accent-indigo-primary">R$ ${course.price ? course.price.toFixed(2) : 'N/A'}</p>
          <span class="text-sm text-light-tertiary">
            <i class="fas fa-star mr-1 text-yellow-400"></i> 
            ${course.averageRating ? course.averageRating.toFixed(1) : '0.0'}
            (${course.numReviews || 0})
          </span>
        </div>
        <a href="#detail-${course.id}"  class="mt-auto block w-full text-center bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">
          Ver Detalhes
        </a>
      </div>
    `;
    container.appendChild(courseElement);
  });
  if (typeof initScrollAnimations === "function") initScrollAnimations(); 
  if (typeof initLazyLoading === "function") initLazyLoading(); 
}

function setupContactForm() {
  const contactForm = document.getElementById('contact-form'); 
  if (!contactForm) return;
  contactForm.addEventListener('submit', function(e) { /* ... seu código original ... */ });
}

function setupCourseSearch() {
  const searchForm = document.getElementById('course-search-form'); 
  if (!searchForm) return;
  searchForm.addEventListener('submit', function(e) { /* ... seu código original ... */ });
}

function displaySearchResults(courses, query) {
    const searchResultsSection = document.getElementById('search-results'); 
    const resultsContainer = document.getElementById('search-results-container'); 
    if (!searchResultsSection || !resultsContainer) return;
    // ... seu código original ...
    if (typeof initScrollAnimations === "function") initScrollAnimations();
    if (typeof initLazyLoading === "function") initLazyLoading();
}

// ============================================================================
// CÓDIGO PARA EXIBIR FOTO DO USUÁRIO E MENU
// ============================================================================
function updateUserInterface(user) {
  const desktopAuthSection = document.getElementById('user-auth-section-desktop'); // ID CORRIGIDO NO HTML
  const mobileAuthSection = document.getElementById('user-auth-section-mobile');   // ID CORRIGIDO NO HTML

  if(desktopAuthSection) desktopAuthSection.innerHTML = ''; // Limpa antes de preencher
  if(mobileAuthSection) mobileAuthSection.innerHTML = '';   // Limpa antes de preencher

  if (user) { // Usuário está logado
    // --- Menu Desktop ---
    if(desktopAuthSection){
        const userProfileDesktopContainer = document.createElement('div');
        userProfileDesktopContainer.className = 'relative';

        const userProfileDesktopTrigger = document.createElement('div');
        userProfileDesktopTrigger.className = 'flex items-center cursor-pointer group';
        userProfileDesktopTrigger.innerHTML = `
          <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email.split('@')[0]) + '&background=4f46e5&color=fff&length=1'}" 
               alt="Foto de perfil" 
               class="w-10 h-10 rounded-full border-2 border-accent-indigo-primary mr-2 object-cover">
          <span class="text-light-primary hidden lg:inline">${user.displayName || user.email.split('@')[0]}</span>
          <i class="fas fa-chevron-down text-light-secondary ml-2 hidden lg:inline group-hover:rotate-180 transition-transform"></i>
        `;
        
        const dropdownMenuDesktop = document.createElement('div');
        dropdownMenuDesktop.className = 'hidden group-hover:block absolute right-0 top-full mt-2 w-60 bg-dark-card rounded-lg shadow-xl z-[100] py-2 border border-gray-700 neon-border';
        dropdownMenuDesktop.innerHTML = `
            <div class="px-4 py-3 border-b border-gray-700">
                <p class="text-sm text-light-primary font-semibold truncate">${user.displayName || user.email.split('@')[0]}</p>
                <p class="text-xs text-light-tertiary truncate">${user.email}</p>
            </div>
            <a href="#dashboard" class="flex items-center px-4 py-2.5 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
              <i class="fas fa-tachometer-alt w-5 mr-3 text-accent-indigo-secondary"></i>Painel
            </a>
            <a href="#profile" class="flex items-center px-4 py-2.5 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
              <i class="fas fa-user w-5 mr-3 text-accent-indigo-secondary"></i>Meu Perfil
            </a>
            <a href="#my-courses" class="flex items-center px-4 py-2.5 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
              <i class="fas fa-graduation-cap w-5 mr-3 text-accent-indigo-secondary"></i>Meus Cursos
            </a>
            <a href="#settings" class="flex items-center px-4 py-2.5 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
              <i class="fas fa-cog w-5 mr-3 text-accent-indigo-secondary"></i>Configurações
            </a>
            <div class="border-t border-gray-700 my-1"></div>
            <a href="#" id="logout-button-desktop" class="flex items-center px-4 py-2.5 text-light-secondary hover:bg-dark-tertiary hover:text-accent-red-secondary transition-colors">
              <i class="fas fa-sign-out-alt w-5 mr-3"></i>Sair
            </a>
        `;
        userProfileDesktopContainer.appendChild(userProfileDesktopTrigger);
        userProfileDesktopContainer.appendChild(dropdownMenuDesktop);
        desktopAuthSection.appendChild(userProfileDesktopContainer);

        const logoutBtnDesktop = document.getElementById('logout-button-desktop');
        if(logoutBtnDesktop) {
            logoutBtnDesktop.addEventListener('click', (e) => {
              e.preventDefault();
              AuthSystem.logoutUser().then(() => {
                showCustomAlert('Você saiu com sucesso!', 'success');
                // O AuthObserver cuidará do redirecionamento para #home se necessário.
              });
            });
        }
    }

    // --- Menu Mobile ---
    if(mobileAuthSection){
        const mobileMenuUserArea = document.createElement('div');
        mobileMenuUserArea.className = 'px-6 py-4 bg-dark-tertiary border-b border-gray-700'; // Área do perfil no menu mobile
        mobileMenuUserArea.innerHTML = `
          <div class="flex items-center">
            <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email.split('@')[0]) + '&background=4f46e5&color=fff&length=1'}" 
                 alt="Foto de perfil" 
                 class="w-10 h-10 rounded-full border-2 border-accent-indigo-primary mr-3 object-cover">
            <div>
                <p class="text-light-primary font-semibold">${user.displayName || user.email.split('@')[0]}</p>
                <p class="text-xs text-light-tertiary truncate">${user.email}</p>
            </div>
          </div>
        `;
        // Adiciona a área do perfil no TOPO da seção de autenticação móvel
        mobileAuthSection.appendChild(mobileMenuUserArea);


        const mobileMenuLinks = [ // Estes são os links DEPOIS da informação do usuário
            { href: "#dashboard", icon: "fa-tachometer-alt", text: "Painel" },
            { href: "#profile", icon: "fa-user", text: "Meu Perfil" },
            { href: "#my-courses", icon: "fa-graduation-cap", text: "Meus Cursos" },
            { href: "#settings", icon: "fa-cog", text: "Configurações" }
        ];
        
        mobileMenuLinks.forEach(link => {
            const linkEl = document.createElement('a');
            linkEl.href = link.href;
            // Ajustando classes para se parecerem com os links originais do menu mobile, mas dentro da seção de auth
            linkEl.className = "block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors";
            linkEl.innerHTML = `<i class="fas ${link.icon} w-5 mr-2 text-accent-indigo-secondary"></i> ${link.text}`;
            mobileAuthSection.appendChild(linkEl);
        });
        
        const logoutLinkMobile = document.createElement('a');
        logoutLinkMobile.href = "#";
        logoutLinkMobile.id = "logout-button-mobile";
        logoutLinkMobile.className = "block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-accent-red-secondary transition-colors";
        logoutLinkMobile.innerHTML = `<i class="fas fa-sign-out-alt w-5 mr-2"></i> Sair`;
        mobileAuthSection.appendChild(logoutLinkMobile);

        logoutLinkMobile.addEventListener('click', (e) => {
            e.preventDefault();
            AuthSystem.logoutUser().then(() => {
                showCustomAlert('Você saiu com sucesso!', 'success');
                 // O AuthObserver cuidará do redirecionamento para #home se necessário.
            });
          });
    }
    
  } else { // Usuário não está logado
    if(desktopAuthSection){
        desktopAuthSection.innerHTML = `<a href="#login" class="gradient-cta text-white px-4 py-2 rounded-lg cta-button">Login</a>`;
    }
    if(mobileAuthSection){ // No menu mobile, o botão de login também deve se parecer com o original.
        mobileAuthSection.innerHTML = `<a href="#login" class="block px-6 py-3 gradient-cta text-white text-center rounded-b-lg">Login</a>`;
    }
  }
}

// CORREÇÃO: Removido o listener firebase.auth().onAuthStateChanged e o DOMContentLoaded que chamavam updateUserInterface.
// A chamada para updateUserInterface agora é centralizada através do AuthSystem.initAuthObserver.

// Exportar sistemas para uso global
window.FullStackCursosAuth = AuthSystem;
window.FullStackCursosCourses = CourseSystem;
window.FullStackCursosPayment = PaymentSystem;
window.FullStackCursosAdmin = AdminSystem;
window.FullStackCursosNotifications = NotificationSystem;
window.FullStackCursosReviews = ReviewSystem;
window.FullStackCursosCertificates = CertificateSystem;
