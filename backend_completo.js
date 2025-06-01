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

db.settings({ timestampsInSnapshots: true }, { merge: true });

// ============================================================================
// SISTEMA DE AUTENTICAÇÃO E USUÁRIOS
// ============================================================================
const AuthSystem = {
  currentUser: null,
  initAuthObserver: function() {
    auth.onAuthStateChanged(user => {
      this.currentUser = user; 
      updateUserInterface(user); 

      if (user) {
        console.log('[AuthObserver] Usuário detectado:', user.uid);
        this.getUserProfile(user.uid).then(profile => {
          console.log('[AuthObserver] Perfil obtido:', profile ? profile.name : 'Sem perfil Firestore');
          
          const currentHash = window.location.hash.substring(1);
          const userSections = ['dashboard', 'profile', 'my-courses', 'settings'];

          if (window.location.hash === '' || window.location.hash === '#home' || window.location.hash === '#login') {
            console.log('[AuthObserver] Usuário logado, redirecionando para #dashboard');
            window.location.hash = 'dashboard'; 
          } else if (userSections.includes(currentHash)) {
            console.log('[AuthObserver] Usuário logado e em seção de usuário:', currentHash, '. Recarregando dados se necessário.');
            if (currentHash === 'dashboard' && typeof displayUserDashboard === 'function') displayUserDashboard();
            else if (currentHash === 'profile' && typeof displayUserProfile === 'function') displayUserProfile(); 
            else if (currentHash === 'my-courses' && typeof displayUserCourses === 'function') displayUserCourses();
            else if (currentHash === 'settings' && typeof displayUserSettings === 'function') displayUserSettings();
          }
        }).catch(error => {
            console.error("[AuthObserver] Erro ao buscar perfil Firestore no login:", error);
            if (window.location.hash === '#dashboard' && typeof displayUserDashboard === 'function') {
                displayUserDashboard(); 
            }
        });
      } else { 
        console.log('[AuthObserver] Nenhum usuário logado.');
        const currentHash = window.location.hash.substring(1);
        if (['dashboard', 'profile', 'my-courses', 'settings'].includes(currentHash)) {
            console.log('[AuthObserver] Usuário deslogou de seção protegida, redirecionando para #home');
            window.location.hash = 'home'; 
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
        aboutMe: userDoc.exists && userDoc.data().aboutMe ? userDoc.data().aboutMe : '',
        lastLoginAt: firebase.firestore.FieldValue.serverTimestamp() 
      };

      if (!userDoc.exists) {
        console.log('[AuthSystem.loginWithGoogle] Novo usuário, criando perfil...');
        userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await userDocRef.set(userData);
      } else {
        console.log('[AuthSystem.loginWithGoogle] Usuário existente, atualizando perfil (nome, foto, último login)...');
        await userDocRef.update({
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
  },
  getUserProfile: async function(userId) {
    if (!userId) throw new Error("User ID não fornecido.");
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) return { id: userDoc.id, ...userDoc.data() };
      
      const authUser = AuthSystem.currentUser; 
      if (authUser && authUser.uid === userId) {
        console.warn("[getUserProfile] Perfil Firestore não encontrado. Criando perfil básico.");
        const basicProfile = {
            id: userId, name: authUser.displayName, email: authUser.email, photoURL: authUser.photoURL,
            role: 'student', courses: [], completedLessons: {}, aboutMe: '',
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
  updateUserProfileData: async function(userId, dataToUpdate) {
    if (!userId) {
        console.error("[updateUserProfileData] User ID não fornecido.");
        showCustomAlert("Erro: ID do usuário não encontrado para atualizar perfil.", "error");
        throw new Error("User ID não fornecido.");
    }
    if (!dataToUpdate || Object.keys(dataToUpdate).length === 0) {
        console.warn("[updateUserProfileData] Nenhum dado fornecido para atualização.");
        return;
    }
    try {
        const userDocRef = db.collection('users').doc(userId);
        await userDocRef.update({
            ...dataToUpdate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
        });
        console.log(`[updateUserProfileData] Perfil do usuário ${userId} atualizado com:`, dataToUpdate);
        showCustomAlert("Perfil atualizado com sucesso!", "success");
    } catch (error) {
        console.error(`[updateUserProfileData] Erro ao atualizar perfil para ${userId}:`, error);
        showCustomAlert(`Erro ao atualizar perfil: ${error.message}`, "error");
        throw error;
    }
  },
  deleteCurrentUserAccount: async function() {
    if (!this.currentUser) {
      showCustomAlert("Nenhum usuário logado para excluir.", "error");
      return;
    }
    
    // IMPORTANTE: A exclusão de usuário é uma operação sensível e pode exigir reautenticação recente.
    // Firebase pode retornar um erro 'auth/requires-recent-login'.
    // Para uma implementação completa, você deve lidar com esse erro e pedir ao usuário para logar novamente.
    
    try {
        const userId = this.currentUser.uid;
        console.log(`[deleteCurrentUserAccount] Tentando excluir conta de AUTENTICAÇÃO do usuário: ${userId}`);
        
        // **REMOVIDA A TENTATIVA DE EXCLUIR DADOS DO FIRESTORE DIRETAMENTE DAQUI**
        // A exclusão de dados do Firestore associados ao usuário deve, idealmente, ser tratada
        // por Firebase Functions acionadas pela exclusão do usuário no Auth para maior segurança e robustez.
        // console.log(`[deleteCurrentUserAccount] A exclusão de dados do Firestore para ${userId} NÃO será feita aqui.`);

        await this.currentUser.delete();
        console.log('[deleteCurrentUserAccount] Conta de AUTENTICAÇÃO do usuário excluída com sucesso.');
        showCustomAlert('Sua conta de autenticação foi excluída com sucesso. Seus dados de perfil (como "Sobre Mim") podem permanecer no banco de dados.', 'success');
        // O onAuthStateChanged cuidará do redirecionamento para #home e atualização da UI.
    } catch (error) {
        console.error('[deleteCurrentUserAccount] Erro ao excluir conta de autenticação:', error);
        if (error.code === 'auth/requires-recent-login') {
            showCustomAlert('Esta operação é sensível e requer login recente. Por favor, saia e entre novamente antes de tentar excluir a conta.', 'error');
        } else {
            showCustomAlert(`Erro ao excluir conta de autenticação: ${error.message}`, 'error');
        }
        throw error;
    }
  }
};

// ============================================================================
// SISTEMA DE GERENCIAMENTO DE CURSOS (Exemplo resumido)
// ============================================================================
const CourseSystem = {
  getFeaturedCourses: async function() { 
    console.log("[CourseSystem.getFeaturedCourses] Buscando cursos em destaque (simulado).");
    return []; 
  },
  searchCourses: async function(query) {
    console.log(`[CourseSystem.searchCourses] Buscando por: "${query}" no Firestore (simulado).`);
    if (!query) return [];
    const allCourses = [ 
        { id: 'logica', title: 'Lógica de Programação Avançada', description: 'Aprenda lógica...', imageUrl: 'images/logica.png', price: 97.00 },
        { id: 'python', title: 'Python para Iniciantes', description: 'Fundamentos de Python...', imageUrl: 'images/python.png', price: 147.00 },
        { id: 'webdev', title: 'Desenvolvimento Web Completo', description: 'Crie sites incríveis...', imageUrl: 'images/placeholder-course.jpg', price: 297.00 },
        { id: 'uxui', title: 'UX/UI Vision: Interfaces que Encantam', description: 'Transforme ideias em experiências memoráveis.', imageUrl: 'images/curso-ux-ui-vision.png', price: 449.90 },
        { id: 'devops', title: 'Cloud Ops Elite: DevOps e Nuvem', description: 'Domine Docker, Kubernetes, CI/CD e nuvens.', imageUrl: 'images/curso-cloud-ops.png', price: 649.90 },
        { id: 'mobile', title: 'App Impact: Apps Multiplataforma', description: 'Desenvolva apps incríveis para Android e iOS.', imageUrl: 'images/curso-app-impact.png', price: 549.90 },
    ];
    return allCourses.filter(course => course.title.toLowerCase().includes(query.toLowerCase()) || course.description.toLowerCase().includes(query.toLowerCase()));
  },
  getBasicCourseInfo: async function(courseId) {
    try {
      // Tenta buscar no Firestore primeiro
      const courseDoc = await db.collection('courses').doc(courseId).get();
      if (courseDoc.exists) {
        const data = courseDoc.data();
        console.log(`[getBasicCourseInfo] Curso ${courseId} encontrado no Firestore.`);
        return { id: courseDoc.id, title: data.title, imageUrl: data.imageUrl, description: data.description, price: data.price };
      }
      
      // Fallback para dados simulados se não encontrar no Firestore (para manter a funcionalidade com os cursos estáticos)
      console.warn(`[getBasicCourseInfo] Curso com ID ${courseId} não encontrado no Firestore. Usando dados simulados como fallback.`);
      const simulatedCourses = {
        'logica': { id: 'logica', title: 'Lógica de Programação Avançada', imageUrl: 'images/logica.png', description: 'Desenvolva o raciocínio lógico fundamental.', price: 97.00 },
        'minicurso': { id: 'minicurso', title: 'Minicurso Programar do Zero', imageUrl: 'images/minicurso.png', description: 'Dê seus primeiros passos na programação.', price: 120.00},
        'python': { id: 'python', title: 'Python Básico para Iniciantes', imageUrl: 'images/python.png', description: 'Aprenda os fundamentos da linguagem Python.', price: 97.00},
        'uxui': { id: 'uxui', title: 'UX/UI Vision: Interfaces que Encantam', imageUrl: 'images/curso-ux-ui-vision.png', description: 'Transforme ideias em experiências memoráveis.', price: 449.90 },
        'devops': { id: 'devops', title: 'Cloud Ops Elite: DevOps e Nuvem', imageUrl: 'images/curso-cloud-ops.png', description: 'Domine Docker, Kubernetes, CI/CD e nuvens.', price: 649.90 },
        'mobile': { id: 'mobile', title: 'App Impact: Apps Multiplataforma', imageUrl: 'images/curso-app-impact.png', description: 'Desenvolva apps incríveis para Android e iOS.', price: 549.90 }
      };
      if(simulatedCourses[courseId]) return simulatedCourses[courseId];

      console.warn(`[getBasicCourseInfo] Curso com ID ${courseId} não encontrado nem no Firestore nem nos dados simulados.`);
      return null;
    } catch (error) {
      console.error("[getBasicCourseInfo] Erro ao buscar informações do curso:", courseId, error);
      throw error;
    }
  }
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
    if(userNameEl) userNameEl.textContent = AuthSystem.currentUser.displayName || "Usuário"; 
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
                const hotmartLink = `https://pay.hotmart.com/SEU_PRODUCT_ID?checkoutMode=X&핫딜=${id}`; 
                html += `
                    <div class="course-card bg-dark-card rounded-xl shadow-lg overflow-hidden flex flex-col">
                        <img src="${course.imageUrl || 'images/placeholder-course.jpg'}" alt="${course.title || 'Curso'}" class="w-full h-48 object-cover">
                        <div class="p-6 flex flex-col flex-grow">
                            <h4 class="text-xl font-semibold mb-2 text-light-primary">${course.title || 'N/A'}</h4>
                            <p class="text-light-tertiary mb-4 text-sm flex-grow">${course.description ? course.description.substring(0,100)+'...' : 'Descrição não disponível.'}</p>
                            <a href="${hotmartLink}" target="_blank" class="mt-auto block w-full text-center bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">
                                Assistir <i class="fas fa-external-link-alt ml-1"></i>
                            </a>
                        </div>
                    </div>`;
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
    const aboutMeTextarea = document.getElementById('user-about-me');
    const saveProfileButton = document.getElementById('save-profile-button');

    if (!contentEl || !aboutMeTextarea || !saveProfileButton) {
        console.error("[displayUserProfile] Elementos da UI do perfil não encontrados.");
        return;
    }

    if (!AuthSystem.currentUser) {
        contentEl.innerHTML = '<p class="text-light-tertiary">Você precisa estar logado.</p>';
        aboutMeTextarea.value = '';
        aboutMeTextarea.disabled = true;
        saveProfileButton.disabled = true;
        return;
    }

    contentEl.innerHTML = '<p class="text-light-tertiary animate-pulse">Carregando perfil...</p>';
    aboutMeTextarea.disabled = true;
    saveProfileButton.disabled = true;

    try {
        const user = AuthSystem.currentUser;
        const profile = await AuthSystem.getUserProfile(user.uid);
        
        const joinDate = profile.createdAt && profile.createdAt.seconds ? new Date(profile.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        contentEl.innerHTML = `
            <div class="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6">
                <img src="${profile.photoURL || user.photoURL || 'images/placeholder-avatar.png'}" alt="Foto do Perfil" class="w-32 h-32 rounded-full border-2 border-accent-indigo-primary object-cover">
                <div>
                    <h3 class="text-2xl font-bold text-light-primary">${profile.name || user.displayName || "Usuário"}</h3>
                    <p class="text-light-secondary">${profile.email || user.email || "Email não disponível"}</p>
                    <p class="text-sm text-light-tertiary mt-1">Membro desde: ${joinDate}</p>
                </div>
            </div>`;
        
        aboutMeTextarea.value = profile.aboutMe || '';
        aboutMeTextarea.disabled = false;
        saveProfileButton.disabled = false;

        const newSaveProfileButton = saveProfileButton.cloneNode(true);
        saveProfileButton.parentNode.replaceChild(newSaveProfileButton, saveProfileButton);
        
        newSaveProfileButton.addEventListener('click', async () => {
            const newAboutMe = aboutMeTextarea.value.trim();
            newSaveProfileButton.disabled = true; 
            newSaveProfileButton.textContent = 'Salvando...';
            try {
                await AuthSystem.updateUserProfileData(user.uid, { aboutMe: newAboutMe });
            } catch (error) {
                // showCustomAlert é chamado em updateUserProfileData
            } finally {
                newSaveProfileButton.disabled = false;
                newSaveProfileButton.textContent = 'Salvar Alterações';
            }
        });

    } catch (error) {
        console.error("[displayUserProfile] Erro:", error);
        contentEl.innerHTML = '<p class="text-red-500">Erro ao carregar perfil.</p>';
        aboutMeTextarea.value = '';
        aboutMeTextarea.disabled = true;
        saveProfileButton.disabled = true;
    }
}

async function displayUserSettings() {
    console.log("[displayUserSettings] Exibindo Configurações.");
    const contentEl = document.getElementById('user-settings-content');
    if (!contentEl || !AuthSystem.currentUser) {
         // Esconde ou limpa a seção se o usuário não estiver logado ou elemento não existir
        if(contentEl) contentEl.innerHTML = '<p class="text-light-tertiary">Você precisa estar logado para ver as configurações.</p>';
        return;
    }


    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
        const newDeleteBtn = deleteBtn.cloneNode(true); 
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        
        newDeleteBtn.textContent = "Excluir Minha Conta"; 

        newDeleteBtn.onclick = async () => {
            if (confirm("Tem certeza que deseja excluir sua conta de AUTENTICAÇÃO? Esta ação é irreversível.")) {
                if (confirm("Confirmação final: Realmente deseja excluir sua conta de autenticação? Seus dados de perfil (como 'Sobre Mim') NÃO serão excluídos do banco de dados por esta ação.")) {
                    newDeleteBtn.disabled = true;
                    newDeleteBtn.textContent = "Excluindo Autenticação...";
                    try {
                        await AuthSystem.deleteCurrentUserAccount();
                    } catch (err) { 
                        // showCustomAlert é chamado em deleteCurrentUserAccount
                        newDeleteBtn.disabled = false;
                        newDeleteBtn.textContent = "Excluir Minha Conta";
                    }
                }
            }
        };
    } else { 
        console.warn("[displayUserSettings] Botão 'delete-account-btn' não encontrado."); 
    }
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
        .then(user => {
            if(user) showCustomAlert(`Login como ${user.displayName} bem-sucedido!`, 'success');
        })
        .catch(err => { /* Erro já tratado */ });
    });
  }
}

// ============================================================================
// INICIALIZAÇÃO E EVENTOS PRINCIPAIS
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  console.log("[DOMContentLoaded] Inicializando sistemas...");
  AuthSystem.initAuthObserver(); 
  
  if (typeof PaymentSystem !== 'undefined' && typeof PaymentSystem.init === 'function') {
    PaymentSystem.init();
  }
  
  if (document.getElementById('featured-courses') && 
      typeof CourseSystem !== 'undefined' && 
      typeof CourseSystem.getFeaturedCourses === 'function' && 
      typeof displayFeaturedCourses === 'function') {
    CourseSystem.getFeaturedCourses()
      .then(courses => {
          if (courses && courses.length > 0) {
            displayFeaturedCourses(courses);
          } else {
            console.log("Nenhum curso em destaque retornado para exibição dinâmica ou cards já no HTML.");
          }
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
  if (!courses || courses.length === 0) {
      console.log("[displayFeaturedCourses] Nenhum curso fornecido para gerar dinamicamente.");
      return;
  }
  
  container.innerHTML = ''; 
  
  courses.forEach(course => {
    const el = document.createElement('div');
    el.className = 'course-card rounded-xl shadow-lg overflow-hidden flex flex-col animate-on-scroll bg-dark-card border border-gray-700'; 
    el.innerHTML = `
      <img src="${course.imageUrl || 'images/placeholder-course.jpg'}" alt="${course.title || 'Curso'}" class="w-full h-48 object-cover lazy-load">
      <div class="p-6 flex flex-col flex-grow">
        <h3 class="text-xl font-semibold mb-2 text-light-primary">${course.title || 'Título Indisponível'}</h3>
        <p class="text-light-tertiary mb-4 text-sm flex-grow">${course.description ? course.description.substring(0,100)+'...' : 'Descrição não disponível.'}</p>
        <div class="mb-4">${course.featured ? '<span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-accent-indigo-text bg-accent-indigo-primary bg-opacity-20">Em Destaque</span>' : ''}</div>
        <div class="flex justify-between items-center mb-3">
          <p class="text-lg font-bold text-accent-indigo-primary">R$ ${course.price ? Number(course.price).toFixed(2).replace('.',',') : 'N/A'}</p>
          <span class="text-sm text-light-tertiary"><i class="fas fa-star text-yellow-400 mr-1"></i> ${course.averageRating ? Number(course.averageRating).toFixed(1) : '0.0'} (${course.numReviews || 0})</span>
        </div>
        <a href="#detail-${course.id}" class="mt-auto block w-full text-center bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">Ver Detalhes</a>
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
        if (!query) { showCustomAlert("Digite algo para buscar.", "info"); return; }

        titleEl.textContent = `Resultados para: "${query}"`;
        resultsContainer.innerHTML = '<p class="animate-pulse col-span-full text-center text-light-secondary">Buscando cursos...</p>';
        resultsSection.style.display = 'block';
        noResultsEl.style.display = 'none';

        try {
            const courses = await CourseSystem.searchCourses(query);
            displaySearchResults(courses, query); 
        } catch (error) {
            console.error("Erro na busca:", error);
            resultsContainer.innerHTML = '<p class="text-red-500 col-span-full text-center">Erro ao realizar busca. Tente novamente.</p>';
        }
        const headerOffset = document.querySelector('header')?.offsetHeight || 80;
        const elementPosition = resultsSection.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    });
}

function displaySearchResults(courses, query) {
    const resultsContainer = document.getElementById('search-results-container');
    const noResultsEl = document.getElementById('no-search-results');
    
    resultsContainer.innerHTML = ''; 
    if (!courses || courses.length === 0) {
        noResultsEl.querySelector('p:first-child').textContent = `Nenhum curso encontrado para "${query}".`;
        noResultsEl.style.display = 'block';
        return;
    }
    noResultsEl.style.display = 'none';

    courses.forEach(course => { 
        const el = document.createElement('div');
        el.className = 'course-card rounded-xl shadow-lg overflow-hidden flex flex-col animate-on-scroll bg-dark-card border border-gray-700'; 
        el.innerHTML = `
            <img src="${course.imageUrl || 'images/placeholder-course.jpg'}" alt="${course.title}" class="w-full h-48 object-cover lazy-load">
            <div class="p-6 flex flex-col flex-grow">
                <h3 class="text-xl font-semibold mb-2 text-light-primary">${course.title}</h3>
                <p class="text-light-tertiary mb-4 text-sm flex-grow">${course.description ? course.description.substring(0, 100) + '...' : 'Descrição não disponível.'}</p>
                <div class="flex justify-between items-center mb-3">
                    <p class="text-lg font-bold text-accent-indigo-primary">R$ ${course.price ? Number(course.price).toFixed(2).replace('.',',') : 'N/A'}</p>
                </div>
                <a href="#detail-${course.id}" class="mt-auto block w-full text-center bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">Ver Detalhes</a>
            </div>`;
        resultsContainer.appendChild(el);
    });
    if (typeof initLazyLoading === "function") initLazyLoading();
    if (typeof initScrollAnimations === "function") initScrollAnimations();
}

function updateUserInterface(user) {
  const desktopAuthSection = document.getElementById('user-auth-section-desktop');
  const mobileAuthSection = document.getElementById('user-auth-section-mobile');

  if (desktopAuthSection) desktopAuthSection.innerHTML = '';
  if (mobileAuthSection) mobileAuthSection.innerHTML = '';

  if (user) {
    const userName = user.displayName || (user.email ? user.email.split('@')[0] : "Usuário");
    const userPhoto = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=4f46e5&color=fff&font-size=0.5&length=1&bold=true`;

    if (desktopAuthSection) {
        desktopAuthSection.innerHTML = `
            <div class="relative group">
                <button type="button" class="flex items-center cursor-pointer focus:outline-none" aria-haspopup="true" aria-expanded="false">
                    <img src="${userPhoto}" alt="Perfil" class="w-10 h-10 rounded-full border-2 border-accent-indigo-primary mr-2 object-cover">
                    <span class="text-light-primary hidden lg:inline">${userName}</span>
                    <i class="fas fa-chevron-down text-light-secondary ml-2 hidden lg:inline group-hover:rotate-180 transition-transform"></i>
                </button>
                <div class="hidden group-focus-within:block group-hover:block absolute right-0 top-full mt-2 w-60 bg-dark-card rounded-lg shadow-xl z-[100] py-2 border border-gray-700 neon-border">
                    <div class="px-4 py-3 border-b border-gray-700">
                        <p class="text-sm text-light-primary font-semibold truncate">${user.displayName || userName}</p>
                        <p class="text-xs text-light-tertiary truncate">${user.email||''}</p>
                    </div>
                    <a href="#dashboard" class="flex items-center px-4 py-2 text-sm text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors"><i class="fas fa-tachometer-alt w-5 mr-3 text-accent-indigo-primary"></i>Painel</a>
                    <a href="#profile" class="flex items-center px-4 py-2 text-sm text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors"><i class="fas fa-user w-5 mr-3 text-accent-indigo-primary"></i>Meu Perfil</a>
                    <a href="#my-courses" class="flex items-center px-4 py-2 text-sm text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors"><i class="fas fa-graduation-cap w-5 mr-3 text-accent-indigo-primary"></i>Meus Cursos</a>
                    <a href="#settings" class="flex items-center px-4 py-2 text-sm text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors"><i class="fas fa-cog w-5 mr-3 text-accent-indigo-primary"></i>Configurações</a>
                    <div class="border-t border-gray-700 my-1"></div>
                    <a href="#" id="logout-button-desktop" class="flex items-center px-4 py-2 text-sm text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors"><i class="fas fa-sign-out-alt w-5 mr-3 text-accent-red-primary"></i>Sair</a>
                </div>
            </div>`;
        const logoutBtn = desktopAuthSection.querySelector('#logout-button-desktop');
        if (logoutBtn) logoutBtn.addEventListener('click', e => { 
            e.preventDefault(); 
            AuthSystem.logoutUser().then(() => showCustomAlert('Logout bem-sucedido!', 'success')); 
        });
    }

    if (mobileAuthSection) {
        mobileAuthSection.innerHTML = `
            <div class="px-6 py-4 bg-dark-tertiary border-b border-gray-700">
                <div class="flex items-center">
                    <img src="${userPhoto}" alt="Perfil" class="w-10 h-10 rounded-full border-2 border-accent-indigo-primary mr-3 object-cover">
                    <div>
                        <p class="text-base font-semibold text-light-primary truncate">${user.displayName || userName}</p>
                        <p class="text-xs text-light-tertiary truncate">${user.email||''}</p>
                    </div>
                </div>
            </div>
            <a href="#dashboard" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary flex items-center"><i class="fas fa-tachometer-alt w-5 mr-3 text-accent-indigo-primary"></i> Painel</a>
            <a href="#profile" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary flex items-center"><i class="fas fa-user w-5 mr-3 text-accent-indigo-primary"></i> Meu Perfil</a>
            <a href="#my-courses" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary flex items-center"><i class="fas fa-graduation-cap w-5 mr-3 text-accent-indigo-primary"></i> Meus Cursos</a>
            <a href="#settings" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary flex items-center"><i class="fas fa-cog w-5 mr-3 text-accent-indigo-primary"></i> Configurações</a>
            <div class="border-t border-gray-700 my-1 mx-6"></div>
            <a href="#" id="logout-button-mobile" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary flex items-center"><i class="fas fa-sign-out-alt w-5 mr-3 text-accent-red-primary"></i> Sair</a>`;
        const logoutBtnMobile = mobileAuthSection.querySelector('#logout-button-mobile');
        if (logoutBtnMobile) logoutBtnMobile.addEventListener('click', e => { 
            e.preventDefault(); 
            AuthSystem.logoutUser().then(() => showCustomAlert('Logout bem-sucedido!', 'success')); 
        });
    }
  } else { 
    if (desktopAuthSection) desktopAuthSection.innerHTML = `<a href="#login" class="gradient-cta text-white px-4 py-2 rounded-lg cta-button">Login</a>`;
    if (mobileAuthSection) mobileAuthSection.innerHTML = `<a href="#login" class="block px-6 py-3 gradient-cta text-white text-center rounded-b-lg mx-4 mb-3">Login</a>`;
  }
}

// EXPORTS
window.FullStackCursosAuth = AuthSystem;
window.FullStackCursosCourses = CourseSystem;
