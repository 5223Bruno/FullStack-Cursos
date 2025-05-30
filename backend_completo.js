/**
 * BACKEND COMPLETO PARA O SITE FullStackCursos
 * * Este arquivo contém todas as funcionalidades de back-end necessárias para o site,
 * incluindo autenticação, gerenciamento de cursos, pagamentos, área do aluno e administração.
 * * INSTRUÇÕES DE INTEGRAÇÃO:
 * 1. Crie uma conta no Firebase (firebase.google.com)
 * 2. Crie um novo projeto
 * 3. Ative os serviços: Authentication, Firestore Database, Storage, e Functions
 * 4. Copie as credenciais do seu projeto Firebase
 * 5. Substitua as credenciais de exemplo abaixo pelas suas
 * 6. Inclua este arquivo no seu projeto
 * 7. Adicione as referências no seu HTML
 */

// ============================================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================================

// Configuração do Firebase (substitua pelos seus dados)
const firebaseConfig = {
  apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es", // Mantenha sua chave original
  authDomain: "fullstack-cursos.firebaseapp.com",
  projectId: "fullstack-cursos",
  storageBucket: "fullstack-cursos.firebasestorage.app",
  messagingSenderId: "934193250493",
  appId: "1:934193250493:web:e4ecf68f0c5ce85739f7d4",
  measurementId: "G-6SW1JH0LX6"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referências aos serviços
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const functions = firebase.functions();

// Configurações do Firestore
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
        this.getUserProfile(user.uid).then(profile => {
          this.updateUIForLoggedUser(profile); // Esta função já existe no seu backend_completo.js
          // Atualiza o placeholder do nome no dashboard se ele existir
          const userNameDashboardEl = document.querySelector('#dashboard .user-name-placeholder');
          if (userNameDashboardEl) {
              userNameDashboardEl.textContent = profile.name || user.displayName || "Usuário";
          }
        }).catch(error => {
            console.error("Erro ao buscar perfil para UI:", error);
            this.updateUIForLoggedUser({ name: user.displayName || user.email }); // Fallback
        });
      } else {
        this.currentUser = null;
        this.updateUIForLoggedOutUser(); // Esta função já existe
      }
    });
  },
  registerUser: async function(name, email, password) {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      await user.updateProfile({ displayName: name });
      await db.collection('users').doc(user.uid).set({
        name: name,
        email: email,
        role: 'student',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        courses: [], 
        completedLessons: {} 
      });
      await user.sendEmailVerification();
      return user;
    } catch (error) {
      console.error("Erro no registro:", error);
      throw error;
    }
  },
  loginUser: async function(email, password) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      return userCredential.user;
    } catch (error) {
      console.error("Erro no login:", error);
      throw error;
    }
  },
  loginWithGoogle: async function() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const userCredential = await auth.signInWithPopup(provider);
      const user = userCredential.user;
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (!userDoc.exists) {
        await db.collection('users').doc(user.uid).set({
          name: user.displayName,
          email: user.email,
          role: 'student',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          courses: [],
          completedLessons: {}
        });
      }
      return user;
    } catch (error) {
      console.error("Erro no login com Google:", error);
      throw error;
    }
  },
  logoutUser: async function() {
    try {
      await auth.signOut();
      // A função updateUserInterface no onAuthStateChanged cuidará da UI.
      // O redirecionamento para #home pode ser feito aqui ou na updateUserInterface.
      // window.location.href = '#home'; // Removido, pois o updateUserInterface já faz o reload que leva para home.
    } catch (error) {
      console.error("Erro no logout:", error);
      throw error;
    }
  },
  resetPassword: async function(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      return true;
    } catch (error) {
      console.error("Erro na recuperação de senha:", error);
      throw error;
    }
  },
  getUserProfile: async function(userId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        return { id: userDoc.id, ...userDoc.data() };
      } else {
        // Se o usuário logou com Google e o doc não foi criado a tempo.
        // Tentamos buscar os dados do auth.currentUser diretamente
        if(auth.currentUser && auth.currentUser.uid === userId){
            console.warn("Perfil não encontrado no Firestore para usuário Google, usando dados do Auth.");
            return { // Retorna um perfil básico
                id: userId,
                name: auth.currentUser.displayName,
                email: auth.currentUser.email,
                role: 'student',
                courses: [],
                completedLessons: {}
            };
        }
        throw new Error("Perfil de usuário não encontrado");
      }
    } catch (error) {
      console.error("Erro ao obter perfil:", error);
      throw error;
    }
  },
  updateUserProfile: async function(userId, profileData) {
    try {
      await db.collection('users').doc(userId).update(profileData);
      return true;
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      throw error;
    }
  },
  isAdmin: async function(userId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        return userDoc.data().role === 'admin';
      }
      return false;
    } catch (error) {
      console.error("Erro ao verificar permissão:", error);
      return false;
    }
  },
  // As funções updateUIForLoggedUser e updateUIForLoggedOutUser já estão no seu JS,
  // elas serão chamadas pelo initAuthObserver. A função updateUserInterface no final do seu JS é a que
  // realmente manipula o DOM do header, então vamos garantir que ela seja chamada corretamente.
  updateUIForLoggedUser: function(profile) { // Manter esta para consistência interna do objeto AuthSystem
    // Esta função pode ser usada para lógica interna do AuthSystem se necessário,
    // mas a manipulação do DOM do header é feita pela 'updateUserInterface(user)' global no seu JS.
    console.log("Usuário logado:", profile.name);
     // Atualiza o placeholder do nome no dashboard
    const userNameDashboardEl = document.querySelector('#dashboard .user-name-placeholder');
    if (userNameDashboardEl && profile) {
        userNameDashboardEl.textContent = profile.name || "Usuário";
    }
  },
  updateUIForLoggedOutUser: function() { // Manter esta
    console.log("Usuário deslogado.");
    const userNameDashboardEl = document.querySelector('#dashboard .user-name-placeholder');
    if (userNameDashboardEl) {
        userNameDashboardEl.textContent = "Usuário"; // Reset placeholder
    }
  }
};

// ============================================================================
// SISTEMA DE GERENCIAMENTO DE CURSOS (Mantido como no seu original)
// ============================================================================
const CourseSystem = {
  getAllCourses: async function() { /* ... seu código ... */ },
  getFeaturedCourses: async function() { /* ... seu código ... */ },
  getCourseDetails: async function(courseId) { /* ... seu código ... */ },
  // ... todas as outras funções do CourseSystem ...
  // Adicionando uma função simples para obter info básica de um curso para "Meus Cursos"
  getBasicCourseInfo: async function(courseId) {
    try {
      const courseDoc = await db.collection('courses').doc(courseId).get();
      if (courseDoc.exists) {
        const data = courseDoc.data();
        return {
          id: courseDoc.id,
          title: data.title,
          imageUrl: data.imageUrl,
          description: data.description // Adicionado para exibir uma breve descrição
        };
      }
      return null;
    } catch (error) {
      console.error("Erro ao obter informações básicas do curso:", error);
      throw error;
    }
  }
};


// ============================================================================
// SISTEMA DE PAGAMENTOS (Mantido como no seu original)
// ============================================================================
const PaymentSystem = { /* ... seu código ... */ };

// ============================================================================
// SISTEMA DE ADMINISTRAÇÃO (Mantido como no seu original)
// ============================================================================
const AdminSystem = { /* ... seu código ... */ };

// ============================================================================
// SISTEMA DE NOTIFICAÇÕES (Mantido como no seu original)
// ============================================================================
const NotificationSystem = { /* ... seu código ... */ };

// ============================================================================
// SISTEMA DE AVALIAÇÕES E COMENTÁRIOS (Mantido como no seu original)
// ============================================================================
const ReviewSystem = { /* ... seu código ... */ };

// ============================================================================
// SISTEMA DE CERTIFICADOS (Mantido como no seu original)
// ============================================================================
const CertificateSystem = { /* ... seu código ... */ };


// ============================================================================
// NOVAS FUNÇÕES PARA EXIBIR CONTEÚDO DAS SEÇÕES DO USUÁRIO
// ============================================================================

async function displayUserDashboard() {
    const dashboardSection = document.getElementById('dashboard');
    if (!dashboardSection) return;

    if (AuthSystem.currentUser) {
        const userProfile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
        const userNameEl = dashboardSection.querySelector('.user-name-placeholder');
        if (userNameEl) {
            userNameEl.textContent = userProfile.name || AuthSystem.currentUser.displayName || "Usuário";
        }
    }
}


async function displayUserCourses() {
    const myCoursesSection = document.getElementById('my-courses');
    const coursesContainer = document.getElementById('user-courses-container'); 
    if (!myCoursesSection || !coursesContainer) {
        console.error("Elementos da seção 'Meus Cursos' não encontrados.");
        return;
    }

    if (!AuthSystem.currentUser) {
        coursesContainer.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Você precisa estar logado para ver seus cursos.</p>';
        return;
    }

    try {
        coursesContainer.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Carregando seus cursos...</p>';
        const userProfile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
        const courseIds = userProfile.courses || [];

        if (courseIds.length === 0) {
            coursesContainer.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Você ainda não está matriculado em nenhum curso. <a href="#courses" class="text-accent-indigo-primary hover:underline">Explore nossos cursos!</a></p>';
            return;
        }

        let coursesHTML = '';
        for (const courseId of courseIds) {
            try {
                const course = await CourseSystem.getBasicCourseInfo(courseId); // Usando a nova função
                if (course) {
                    // VOCÊ DEVERÁ SUBSTITUIR ESTE LINK por um link real ou uma forma de gerar o link correto.
                    const hotmartLink = `https://payment.hotmart.com/COMPRE_E_COLOQUE_SEU_LINK_DE_PRODUTO_AQUI?checkoutMode=X&ید=${courseId}`; // Exemplo de Placeholder
                    coursesHTML += `
                        <div class="course-card bg-dark-card rounded-xl shadow-lg overflow-hidden flex flex-col">
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
                     coursesHTML += `<div class="bg-dark-card rounded-lg p-4 text-red-400">Informações do curso ID ${courseId} não encontradas.</div>`;
                }
            } catch (courseError) {
                console.error("Erro ao buscar detalhes do curso:", courseId, courseError);
                coursesHTML += `<div class="bg-dark-card rounded-lg p-4 text-red-400">Não foi possível carregar o curso ID: ${courseId}.</div>`;
            }
        }
        coursesContainer.innerHTML = coursesHTML || '<p class="text-light-tertiary col-span-full text-center">Nenhum curso para exibir.</p>';
        // Re-inicializar lazy loading para as novas imagens
        if (typeof initLazyLoading === "function") initLazyLoading();

    } catch (error) {
        console.error("Erro ao exibir cursos do usuário:", error);
        coursesContainer.innerHTML = '<p class="text-red-500 col-span-full text-center">Ocorreu um erro ao carregar seus cursos. Tente novamente mais tarde.</p>';
    }
}

async function displayUserProfile() {
    const profileSection = document.getElementById('profile');
    const profileContent = document.getElementById('user-profile-content');
    if (!profileSection || !profileContent) return;

    if (!AuthSystem.currentUser) {
        profileContent.innerHTML = '<p class="text-light-tertiary">Você precisa estar logado para ver seu perfil.</p>';
        return;
    }
    try {
        profileContent.innerHTML = '<p class="text-light-tertiary">Carregando seu perfil...</p>';
        const user = AuthSystem.currentUser;
        const userProfileData = await AuthSystem.getUserProfile(user.uid);

        profileContent.innerHTML = `
            <div class="flex items-center space-x-4 mb-6">
                <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userProfileData.name || user.email)}" 
                     alt="Foto de perfil" 
                     class="w-24 h-24 rounded-full border-4 border-accent-indigo-primary">
                <div>
                    <h3 class="text-2xl font-bold text-light-primary">${userProfileData.name || user.displayName}</h3>
                    <p class="text-accent-indigo-text">${userProfileData.email || user.email}</p>
                </div>
            </div>
            <div>
                <h4 class="text-lg font-semibold text-light-primary mb-2">Sobre Mim (Exemplo)</h4>
                <textarea class="w-full bg-dark-tertiary border border-gray-700 rounded-lg py-2 px-4 text-light-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo-primary" rows="3" placeholder="Escreva um pouco sobre você... (funcionalidade a ser implementada)"></textarea>
            </div>
            <button class="mt-4 bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">
                Salvar Alterações (Exemplo)
            </button>
        `;
    } catch (error) {
        console.error("Erro ao exibir perfil do usuário:", error);
        profileContent.innerHTML = '<p class="text-red-500">Ocorreu um erro ao carregar seu perfil.</p>';
    }
}

async function displayUserSettings() {
    const settingsSection = document.getElementById('settings');
    const settingsContent = document.getElementById('user-settings-content');
    if (!settingsSection || !settingsContent) return;

    if (!AuthSystem.currentUser) {
        settingsContent.innerHTML = '<p class="text-light-tertiary">Você precisa estar logado para ver as configurações.</p>';
        return;
    }
    // O HTML já tem placeholders, então podemos apenas confirmar que está logado.
    settingsContent.querySelector('p').textContent = 'Gerencie suas preferências e conta.'; 
    // Lógica adicional para carregar e salvar configurações pode ser adicionada aqui.
}


// ============================================================================
// INICIALIZAÇÃO E EVENTOS (Mantido como no seu original, com pequenas adições)
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  AuthSystem.initAuthObserver();
  
  if (typeof PaymentSystem !== 'undefined' && PaymentSystem.init) {
    PaymentSystem.init();
  }
  
  if (document.getElementById('featured-courses') && CourseSystem && CourseSystem.getFeaturedCourses) {
    CourseSystem.getFeaturedCourses()
      .then(courses => {
        // A função displayFeaturedCourses já existe no seu JS.
        if (typeof displayFeaturedCourses === 'function') {
            displayFeaturedCourses(courses);
        }
      })
      .catch(error => {
        console.error("Erro ao carregar cursos em destaque:", error);
      });
  }
  
  // A função setupLoginForm já existe no seu JS e lida com o google-login-btn também.
  if (typeof setupLoginForm === 'function') setupLoginForm();
  if (typeof setupRegisterForm === 'function') setupRegisterForm(); // Se você tiver uma seção #register-form
  if (typeof setupContactForm === 'function') setupContactForm(); // Se você tiver uma seção #contact-form
  if (typeof setupCourseSearch === 'function') setupCourseSearch(); // Se você tiver uma seção #course-search-form
  
  // Verificar se o usuário já está logado quando a página carrega (esta parte já existe no seu JS no final)
  // const user = firebase.auth().currentUser;
  // if (user) {
  //   updateUserInterface(user); // Esta é a função global do seu JS.
  // }
});


// ============================================================================
// Funções de UI Globais (Existentes no seu backend_completo.js)
// ============================================================================

// Função para exibir cursos em destaque (Já existe no seu JS)
// function displayFeaturedCourses(courses) { /* ... seu código ... */ }

// Configurar formulário de login (Já existe no seu JS)
// function setupLoginForm() { /* ... seu código ... */ }

// Configurar formulário de registro (Já existe no seu JS)
// function setupRegisterForm() { /* ... seu código ... */ }

// Configurar formulário de contato (Já existe no seu JS)
// function setupContactForm() { /* ... seu código ... */ }

// Configurar busca de cursos (Já existe no seu JS)
// function setupCourseSearch() { /* ... seu código ... */ }

// Exibir resultados da busca (Já existe no seu JS)
// function displaySearchResults(courses, query) { /* ... seu código ... */ }


// ============================================================================
// CÓDIGO PARA EXIBIR FOTO DO USUÁRIO (Existente no seu backend_completo.js - MANTENHA-O)
// ============================================================================
function updateUserInterface(user) {
  const loginButton = document.querySelector('header nav a[href="#login"]');
  const mobileLoginButton = document.querySelector('#mobile-menu a[href="#login"]');
  const existingUserProfileDesktop = document.querySelector('header nav .user-profile-desktop-container');
  const existingUserProfileMobileAnchor = document.querySelector('#mobile-menu a.user-profile-mobile-anchor'); // Usaremos um <a> para substituir o botão de login

  if (existingUserProfileDesktop) existingUserProfileDesktop.remove();
  if (existingUserProfileMobileAnchor) {
      // Remover também os links de perfil/cursos/configurações que foram adicionados anteriormente
      let nextSibling = existingUserProfileMobileAnchor.nextElementSibling;
      while(nextSibling && ['#profile', '#my-courses', '#settings', '#logout-button-mobile'].includes(nextSibling.getAttribute('href'))) {
          let toRemove = nextSibling;
          nextSibling = nextSibling.nextElementSibling;
          toRemove.remove();
      }
      existingUserProfileMobileAnchor.remove();
  }


  if (user) {
    const userProfileDesktopContainer = document.createElement('div');
    userProfileDesktopContainer.className = 'user-profile-desktop-container relative'; // Adicionado container e relative

    const userProfileDesktopTrigger = document.createElement('div');
    userProfileDesktopTrigger.className = 'flex items-center cursor-pointer group';
    userProfileDesktopTrigger.innerHTML = `
      <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email.split('@')[0]) + '&background=4f46e5&color=fff'}" 
           alt="Foto de perfil" 
           class="w-8 h-8 rounded-full border-2 border-accent-indigo-primary mr-2">
      <span class="text-light-primary hidden md:inline">${user.displayName || user.email.split('@')[0]}</span>
      <i class="fas fa-chevron-down text-light-secondary ml-2 hidden md:inline group-hover:rotate-180 transition-transform"></i>
    `;
    
    const dropdownMenuDesktop = document.createElement('div');
    dropdownMenuDesktop.className = 'hidden group-hover:block absolute right-0 top-full mt-2 w-56 bg-dark-card rounded-lg shadow-xl z-50 py-2 border border-gray-700 neon-border';
    dropdownMenuDesktop.innerHTML = `
        <div class="px-4 py-3 border-b border-gray-700">
            <p class="text-sm text-light-primary font-semibold">${user.displayName || user.email.split('@')[0]}</p>
            <p class="text-xs text-light-tertiary truncate">${user.email}</p>
        </div>
        <a href="#dashboard" class="flex items-center px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
          <i class="fas fa-tachometer-alt w-5 mr-2 text-accent-indigo-secondary"></i> Painel
        </a>
        <a href="#profile" class="flex items-center px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
          <i class="fas fa-user w-5 mr-2 text-accent-indigo-secondary"></i> Meu Perfil
        </a>
        <a href="#my-courses" class="flex items-center px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
          <i class="fas fa-graduation-cap w-5 mr-2 text-accent-indigo-secondary"></i> Meus Cursos
        </a>
        <a href="#settings" class="flex items-center px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
          <i class="fas fa-cog w-5 mr-2 text-accent-indigo-secondary"></i> Configurações
        </a>
        <div class="border-t border-gray-700 my-1"></div>
        <a href="#" id="logout-button" class="flex items-center px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary transition-colors">
          <i class="fas fa-sign-out-alt w-5 mr-2 text-accent-red-secondary"></i> Sair
        </a>
    `;
    userProfileDesktopContainer.appendChild(userProfileDesktopTrigger);
    userProfileDesktopContainer.appendChild(dropdownMenuDesktop);

    if (loginButton && loginButton.parentNode) {
      loginButton.parentNode.replaceChild(userProfileDesktopContainer, loginButton);
    }
    
    const mobileMenuUserArea = document.createElement('a'); // Era div, mudei para 'a' para consistência, mas sem href real
    mobileMenuUserArea.className = 'user-profile-mobile-anchor block px-6 py-4 bg-dark-tertiary border-b border-gray-700';
    mobileMenuUserArea.innerHTML = `
      <div class="flex items-center">
        <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email.split('@')[0]) + '&background=4f46e5&color=fff'}" 
             alt="Foto de perfil" 
             class="w-10 h-10 rounded-full border-2 border-accent-indigo-primary mr-3">
        <div>
            <p class="text-light-primary font-semibold">${user.displayName || user.email.split('@')[0]}</p>
            <p class="text-xs text-light-tertiary truncate">${user.email}</p>
        </div>
      </div>
    `;

    const mobileMenuLinks = [
        { href: "#dashboard", icon: "fa-tachometer-alt", text: "Painel" },
        { href: "#profile", icon: "fa-user", text: "Meu Perfil" },
        { href: "#my-courses", icon: "fa-graduation-cap", text: "Meus Cursos" },
        { href: "#settings", icon: "fa-cog", text: "Configurações" },
        { href: "#logout-button-mobile", icon: "fa-sign-out-alt", text: "Sair", id: "logout-button-mobile-link" }
    ];
    
    let mobileProfileLinksHTML = '';
    mobileMenuLinks.forEach(link => {
        mobileProfileLinksHTML += `
        <a href="${link.href}" ${link.id ? `id="${link.id}"` : ''} class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary pl-10 transition-colors">
            <i class="fas ${link.icon} w-5 mr-2 text-accent-indigo-secondary"></i> ${link.text}
        </a>`;
    });
    
    if (mobileLoginButton && mobileLoginButton.parentNode) {
      mobileLoginButton.parentNode.insertBefore(mobileMenuUserArea, mobileLoginButton);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = mobileProfileLinksHTML;
      while(tempDiv.firstChild){
          mobileMenuUserArea.parentNode.insertBefore(tempDiv.firstChild, mobileMenuUserArea.nextSibling);
      }
      mobileLoginButton.remove();
    }
    
    const logoutBtnDesktop = document.getElementById('logout-button');
    if(logoutBtnDesktop) {
        logoutBtnDesktop.addEventListener('click', (e) => {
          e.preventDefault();
          AuthSystem.logoutUser().then(() => { // Usando o logout do AuthSystem
            showCustomAlert('Você saiu com sucesso!', 'success');
          });
        });
    }
    
    const logoutBtnMobile = document.getElementById('logout-button-mobile-link'); // O ID está no <a> agora
    if (logoutBtnMobile) {
      logoutBtnMobile.addEventListener('click', (e) => {
        e.preventDefault();
        AuthSystem.logoutUser().then(() => { // Usando o logout do AuthSystem
            showCustomAlert('Você saiu com sucesso!', 'success');
        });
      });
    }
    
  } else {
    // Usuário não está logado
    const nav = document.querySelector('header nav .hidden.md\\:flex');
    if (nav && !nav.querySelector('a[href="#login"]')) {
        const newLoginButton = document.createElement('a');
        newLoginButton.href = '#login';
        newLoginButton.className = 'gradient-cta text-white px-4 py-2 rounded-lg cta-button';
        newLoginButton.textContent = 'Login';
        // Encontrar o último link de navegação e adicionar depois, ou no final do contêiner
        const lastLink = nav.querySelector('a[href*="wa.me"]');
        if(lastLink) lastLink.insertAdjacentElement('afterend', newLoginButton);
        else nav.appendChild(newLoginButton);
    }

    const mobileMenuDiv = document.getElementById('mobile-menu');
    if (mobileMenuDiv && !mobileMenuDiv.querySelector('a[href="#login"].gradient-cta')) {
        const newMobileLoginButton = document.createElement('a');
        newMobileLoginButton.href = '#login';
        newMobileLoginButton.className = 'block px-6 py-3 gradient-cta text-white text-center rounded-b-lg';
        newMobileLoginButton.textContent = 'Login';
        mobileMenuDiv.appendChild(newMobileLoginButton);
    }
  }
}

// Listener de autenticação já existente no seu JS, ele chama updateUserInterface
// firebase.auth().onAuthStateChanged((user) => {
//   updateUserInterface(user);
// });

// Este listener DOMContentLoaded no final do seu JS já chama updateUserInterface se o usuário estiver logado.
// document.addEventListener('DOMContentLoaded', () => {
//   const user = firebase.auth().currentUser;
//   if (user) {
//     updateUserInterface(user);
//   }
// });


// Exportar sistemas para uso global (Mantido como no seu original)
window.FullStackCursosAuth = AuthSystem;
window.FullStackCursosCourses = CourseSystem;
window.FullStackCursosPayment = PaymentSystem;
window.FullStackCursosAdmin = AdminSystem;
window.FullStackCursosNotifications = NotificationSystem;
window.FullStackCursosReviews = ReviewSystem;
window.FullStackCursosCertificates = CertificateSystem;
