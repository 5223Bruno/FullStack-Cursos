/**************************************************************************
 * BACKEND COMPLETO PARA O SITE FullStackCursos (MODIFICADO)
 **************************************************************************/

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
    auth.onAuthStateChanged(async user => { // Tornar async para aguardar perfil
      if (user) {
        this.currentUser = user;
        console.log('[AuthObserver] Usuário detectado:', user.uid);
        try {
          const profile = await this.getUserProfile(user.uid);
          console.log('[AuthObserver] Perfil obtido:', profile);
          updateUserInterface(user, profile); // Passa o perfil para a UI

          // Redirecionamento após login (se necessário)
          if(window.location.hash === '' || window.location.hash === '#home' || window.location.hash === '#login' || window.location.hash === '#register') {
            console.log('[AuthObserver] Redirecionando para #dashboard');
            window.location.href = '#dashboard'; // Redireciona para o dashboard como padrão
          } else {
            // Se já existe um hash, revalida a seção atual (handleHashChange fará isso)
            handleHashChange();
          }
        } catch (error) {
            console.error("[AuthObserver] Erro ao buscar perfil para UI:", error);
            updateUserInterface(user, null); // Fallback com dados do Auth se perfil falhar
            // Decide se redireciona mesmo sem perfil completo
            if(window.location.hash === '' || window.location.hash === '#home' || window.location.hash === '#login' || window.location.hash === '#register') {
                window.location.href = '#dashboard';
            }
        }
      } else {
        this.currentUser = null;
        console.log('[AuthObserver] Nenhum usuário logado.');
        updateUserInterface(null, null);
        // Se o usuário deslogou e estava em uma seção protegida, redireciona para #home
        const currentHash = window.location.hash.substring(1);
        const protectedSections = ['dashboard', 'profile', 'my-courses', 'settings'];
        if (protectedSections.includes(currentHash)) {
            window.location.href = '#home';
        }
      }
    });
  },
  registerUser: async function(name, email, password) {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      await user.updateProfile({ displayName: name });
      // Criar perfil no Firestore
      await db.collection('users').doc(user.uid).set({
        name: name,
        email: email,
        role: 'student',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        courses: [],
        completedLessons: {}
      });
      showCustomAlert('Registro realizado com sucesso! Você já está logado.', 'success');
      return user;
    } catch (error) {
      console.error("Erro no registro:", error);
      showCustomAlert(`Erro no registro: ${error.message}`, 'error');
      throw error;
    }
  },
  loginUser: async function(email, password) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      showCustomAlert('Login realizado com sucesso!', 'success');
      return userCredential.user;
    } catch (error) {
      console.error("Erro no login:", error);
      showCustomAlert(`Erro no login: ${error.message}`, 'error');
      throw error;
    }
  },
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
        }, { merge: true }); // Usar merge true para segurança
        console.log('[AuthSystem.loginWithGoogle] Perfil criado para:', user.displayName);
      } else {
        console.log('[AuthSystem.loginWithGoogle] Usuário já existe:', user.displayName);
        // Atualiza nome/foto caso tenham mudado no Google (opcional, mas bom)
        await userDocRef.update({
            name: user.displayName,
            photoURL: user.photoURL
        });
        console.log('[AuthSystem.loginWithGoogle] Perfil atualizado para:', user.displayName);
      }
      showCustomAlert('Login com Google realizado com sucesso!', 'success');
      return user; // Retorna o objeto user
    } catch (error) {
      console.error("[AuthSystem.loginWithGoogle] Erro dentro da função:", error, "Código:", error.code);
      // Tratar erros comuns de popup
      if (error.code === 'auth/popup-closed-by-user') {
        showCustomAlert('Login com Google cancelado.', 'error');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignorar, pois outro popup pode ter sido aberto
      } else {
        showCustomAlert(`Erro no login com Google: ${error.message}`, 'error');
      }
      throw error;
    }
  },
  logoutUser: async function() {
    try {
      await auth.signOut();
      showCustomAlert('Logout realizado com sucesso.', 'success');
      // A UI será atualizada pelo onAuthStateChanged
    } catch (error) {
      console.error("Erro no logout:", error);
      showCustomAlert(`Erro ao fazer logout: ${error.message}`, 'error');
      throw error;
    }
  },
  resetPassword: async function(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      showCustomAlert('Email de redefinição de senha enviado! Verifique sua caixa de entrada.', 'success');
    } catch (error) {
      console.error("Erro ao enviar email de redefinição:", error);
      showCustomAlert(`Erro ao enviar email: ${error.message}`, 'error');
      throw error;
    }
  },
  getUserProfile: async function(userId) {
    if (!userId) {
        console.error("[getUserProfile] ID do usuário não fornecido.");
        throw new Error("ID do usuário não fornecido");
    }
    try {
      const userDocRef = db.collection('users').doc(userId);
      const userDoc = await userDocRef.get();
      if (userDoc.exists) {
        return { id: userDoc.id, ...userDoc.data() };
      } else {
        // Se não existe no Firestore, tenta pegar do Auth (caso de Google Login sem doc ainda)
        const currentUserAuth = auth.currentUser;
        if (currentUserAuth && currentUserAuth.uid === userId) {
            console.warn("[getUserProfile] Perfil não encontrado no Firestore. Usando dados do Auth e criando perfil básico.");
            const basicProfile = {
                id: userId,
                name: currentUserAuth.displayName || 'Usuário',
                email: currentUserAuth.email,
                photoURL: currentUserAuth.photoURL,
                role: 'student',
                courses: [],
                completedLessons: {},
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            // Tenta criar o perfil para consistência futura
            await userDocRef.set(basicProfile, { merge: true });
            return basicProfile;
        }
        console.error("[getUserProfile] Perfil de usuário não encontrado no Firestore nem no Auth.");
        throw new Error("Perfil de usuário não encontrado");
      }
    } catch (error) {
      console.error("[getUserProfile] Erro ao obter perfil:", error);
      throw error;
    }
  },
  updateUserProfile: async function(userId, profileData) {
    if (!userId) throw new Error("ID do usuário não fornecido");
    try {
      const userDocRef = db.collection('users').doc(userId);
      await userDocRef.update(profileData);
      showCustomAlert('Perfil atualizado com sucesso!', 'success');
      // Atualiza o nome no cabeçalho imediatamente
      const userNameDisplay = document.getElementById('user-name-display');
      if (userNameDisplay && profileData.name) {
          userNameDisplay.textContent = profileData.name;
      }
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      showCustomAlert(`Erro ao atualizar perfil: ${error.message}`, 'error');
      throw error;
    }
  },
  isAdmin: async function(userId) {
    if (!userId) return false;
    try {
      const profile = await this.getUserProfile(userId);
      return profile && profile.role === 'admin';
    } catch (error) {
      console.error("Erro ao verificar se é admin:", error);
      return false;
    }
  }
};

// ============================================================================
// SISTEMA DE GERENCIAMENTO DE CURSOS
// ============================================================================
const CourseSystem = {
  // ... (outras funções como getAllCourses, getFeaturedCourses, etc. - mantidas do original)
  getAllCourses: async function() {
    try {
      const snapshot = await db.collection('courses').orderBy('createdAt', 'desc').get();
      const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return courses;
    } catch (error) {
      console.error("Erro ao buscar todos os cursos:", error);
      throw error;
    }
  },
  getFeaturedCourses: async function() {
    try {
      const snapshot = await db.collection('courses').where('isFeatured', '==', true).limit(3).get();
      const courses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return courses;
    } catch (error) {
      console.error("Erro ao buscar cursos em destaque:", error);
      throw error;
    }
  },
  getCourseDetails: async function(courseId) {
    try {
      const courseDoc = await db.collection('courses').doc(courseId).get();
      if (!courseDoc.exists) {
        throw new Error("Curso não encontrado");
      }
      // Poderia buscar módulos/aulas aqui se necessário para a página de detalhes
      return { id: courseDoc.id, ...courseDoc.data() };
    } catch (error) {
      console.error("Erro ao buscar detalhes do curso:", courseId, error);
      throw error;
    }
  },
  getBasicCourseInfo: async function(courseId) {
    try {
      const courseDoc = await db.collection('courses').doc(courseId).get();
      if (courseDoc.exists) {
        const data = courseDoc.data();
        return {
          id: courseDoc.id,
          title: data.title || 'Título Indisponível',
          imageUrl: data.imageUrl || 'images/placeholder-course.jpg', // Fallback image
          description: data.description || ''
        };
      }
      console.warn(`[getBasicCourseInfo] Curso com ID ${courseId} não encontrado.`);
      return null;
    } catch (error) {
      console.error("[getBasicCourseInfo] Erro ao obter informações básicas do curso:", courseId, error);
      throw error;
    }
  }
  // ... (funções de add/update/delete, upload, progresso - mantidas do original, se existirem)
};

// ============================================================================
// SISTEMAS ADICIONAIS (Placeholders ou código original mantido)
// ============================================================================
const PaymentSystem = { /* ... */ };
const AdminSystem = { /* ... */ };
const NotificationSystem = { /* ... */ };
const ReviewSystem = { /* ... */ };
const CertificateSystem = { /* ... */ };

// ============================================================================
// FUNÇÕES DE EXIBIÇÃO DE CONTEÚDO DAS SEÇÕES
// ============================================================================

// Função genérica para mostrar uma seção e esconder as outras
function showSection(sectionId) {
    const sections = document.querySelectorAll('main > section, .user-section'); // Inclui seções de usuário
    sections.forEach(section => {
        if (section.id === sectionId) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    });
    // Rola para o topo da página ao mudar de seção
    window.scrollTo(0, 0);
}

async function displayUserDashboard() {
    console.log("[displayUserDashboard] Exibindo painel.");
    const dashboardSection = document.getElementById('dashboard');
    if (!dashboardSection) {
        console.error("[displayUserDashboard] Seção #dashboard não encontrada.");
        showSection('home'); // Volta para home se não achar
        return;
    }
    showSection('dashboard');

    if (AuthSystem.currentUser) {
        try {
            // O nome já é atualizado no header pela updateUserInterface
            // Poderia adicionar outras informações do dashboard aqui
            const profile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
            const welcomeMsg = dashboardSection.querySelector('#dashboard-welcome');
            if(welcomeMsg && profile) {
                welcomeMsg.textContent = `Bem-vindo(a) de volta, ${profile.name || 'Aluno(a)'}!`;
            }
        } catch (error) {
            console.error("[displayUserDashboard] Erro ao buscar dados para dashboard:", error);
            const welcomeMsg = dashboardSection.querySelector('#dashboard-welcome');
            if(welcomeMsg) welcomeMsg.textContent = 'Bem-vindo(a)!';
        }
    } else {
        // Se não está logado, não deveria estar aqui, redireciona
        window.location.href = '#login';
    }
}

async function displayUserCourses() {
    console.log("[displayUserCourses] Exibindo Meus Cursos.");
    const myCoursesSection = document.getElementById('my-courses');
    const coursesContainer = document.getElementById('user-courses-container');
    if (!myCoursesSection || !coursesContainer) {
        console.error("[displayUserCourses] Elementos da seção 'Meus Cursos' não encontrados.");
        showSection('dashboard'); // Volta para dashboard se não achar
        return;
    }
    showSection('my-courses');

    if (!AuthSystem.currentUser) {
        coursesContainer.innerHTML = '<p class="text-light-tertiary col-span-full text-center">Você precisa estar logado para ver seus cursos.</p>';
        // Redireciona para login se tentar acessar sem estar logado
        setTimeout(() => { window.location.href = '#login'; }, 1500);
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

        // Usando Promise.all para buscar informações dos cursos em paralelo
        const coursePromises = courseIds.map(id => CourseSystem.getBasicCourseInfo(id));
        const courses = await Promise.all(coursePromises);

        let coursesHTML = '';
        courses.forEach((course, index) => {
            if (course) {
                console.log("[displayUserCourses] Detalhes do curso:", course.title);
                // REMOVIDO o link/botão externo da Hotmart conforme solicitado
                coursesHTML += `
                    <div class="course-card bg-dark-card rounded-xl shadow-lg overflow-hidden flex flex-col neon-border animate-on-scroll delay-${(index % 3) * 200}ms">
                        <img src="${course.imageUrl}" alt="${course.title}" class="w-full h-48 object-cover lazy-load">
                        <div class="p-6 flex flex-col flex-grow">
                            <h4 class="text-xl font-semibold mb-2 text-light-primary">${course.title}</h4>
                            <p class="text-light-tertiary text-sm mb-4 flex-grow">${course.description ? course.description.substring(0, 100) + '...' : 'Descrição do curso.'}</p>
                            <!-- Botão removido, apenas exibe o card -->
                             <div class="mt-auto pt-2 border-t border-gray-700">
                                <span class="text-sm text-accent-emerald-text">Matriculado</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                 coursesHTML += `<div class="bg-dark-card rounded-lg p-4 text-red-400 col-span-full">Informações do curso ID ${courseIds[index]} não encontradas.</div>`;
            }
        });

        coursesContainer.innerHTML = coursesHTML || '<p class="text-light-tertiary col-span-full text-center">Nenhum curso para exibir.</p>';
        // Re-inicializa lazy loading e animações de scroll para os novos cards
        if (typeof initLazyLoading === "function") initLazyLoading();
        if (typeof initScrollAnimations === "function") initScrollAnimations();

    } catch (error) {
        console.error("[displayUserCourses] Erro ao exibir cursos do usuário:", error);
        coursesContainer.innerHTML = '<p class="text-red-500 col-span-full text-center">Ocorreu um erro ao carregar seus cursos. Tente novamente mais tarde.</p>';
    }
}

async function displayUserProfile() {
    console.log("[displayUserProfile] Exibindo Perfil do Usuário.");
    const profileSection = document.getElementById('profile');
    const profileForm = document.getElementById('profile-form'); // Assumindo que existe um form com este ID
    if (!profileSection || !profileForm) {
        console.error("[displayUserProfile] Elementos da seção 'Perfil' não encontrados.");
        showSection('dashboard'); // Volta para dashboard
        return;
    }
    showSection('profile');

    if (!AuthSystem.currentUser) {
        // Redireciona para login
        window.location.href = '#login';
        return;
    }

    try {
        const profile = await AuthSystem.getUserProfile(AuthSystem.currentUser.uid);
        // Preencher os campos do formulário com os dados do perfil
        const nameInput = profileForm.querySelector('input[name="name"]');
        const emailInput = profileForm.querySelector('input[name="email"]');
        // Adicione outros campos se houver (ex: photoURL)

        if (nameInput) nameInput.value = profile.name || '';
        if (emailInput) {
            emailInput.value = profile.email || '';
            emailInput.disabled = true; // Geralmente não se permite mudar email facilmente
            emailInput.classList.add('bg-gray-600', 'cursor-not-allowed');
        }

        // Exibir outras informações básicas se houver elementos para isso
        const profileCreatedAt = document.getElementById('profile-created-at');
        if(profileCreatedAt && profile.createdAt) {
            profileCreatedAt.textContent = `Membro desde: ${new Date(profile.createdAt.seconds * 1000).toLocaleDateString()}`;
        }

    } catch (error) {
        console.error("[displayUserProfile] Erro ao carregar perfil:", error);
        showCustomAlert('Erro ao carregar dados do perfil.', 'error');
    }
}

async function displayUserSettings() {
    console.log("[displayUserSettings] Exibindo Configurações.");
    const settingsSection = document.getElementById('settings');
    if (!settingsSection) {
        console.error("[displayUserSettings] Seção #settings não encontrada.");
        showSection('dashboard');
        return;
    }
    showSection('settings');

    if (!AuthSystem.currentUser) {
        window.location.href = '#login';
        return;
    }
    // Limpar campos de senha ao exibir a seção
    const passwordForm = document.getElementById('change-password-form');
    if (passwordForm) passwordForm.reset();
}

// ============================================================================
// MANIPULAÇÃO DA INTERFACE E EVENTOS
// ============================================================================

// Função para atualizar a UI baseada no estado de login
function updateUserInterface(user, profile) {
    const loginButton = document.getElementById('login-button');
    const userMenuContainer = document.getElementById('user-menu-container');
    const userNameDisplay = document.getElementById('user-name-display');
    const mobileMenuLoginLink = document.querySelector('#mobile-menu a[href="#login"]');
    const mobileMenuUserLinks = document.getElementById('mobile-menu-user-links'); // Novo container para links de usuário no mobile

    if (user) {
        // Logado
        if (loginButton) loginButton.style.display = 'none';
        if (userMenuContainer) userMenuContainer.style.display = 'block'; // Ou 'flex' se necessário
        if (userNameDisplay) {
            userNameDisplay.textContent = profile?.name || user.displayName || 'Usuário';
        }
        // Atualizar menu mobile
        if (mobileMenuLoginLink) mobileMenuLoginLink.style.display = 'none';
        if (mobileMenuUserLinks) mobileMenuUserLinks.style.display = 'block';

    } else {
        // Deslogado
        if (loginButton) loginButton.style.display = 'block'; // Ou 'inline-block' etc.
        if (userMenuContainer) userMenuContainer.style.display = 'none';
        // Esconder dropdown explicitamente ao deslogar
        const userDropdownMenu = document.getElementById('user-dropdown-menu');
        if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
        // Resetar nome
        if (userNameDisplay) userNameDisplay.textContent = 'Usuário';
        // Atualizar menu mobile
        if (mobileMenuLoginLink) mobileMenuLoginLink.style.display = 'block';
        if (mobileMenuUserLinks) mobileMenuUserLinks.style.display = 'none';
    }
}

// Função para controlar o dropdown do usuário
function setupUserDropdown() {
    const userMenuButton = document.getElementById('user-menu-button');
    const userDropdownMenu = document.getElementById('user-dropdown-menu');
    const logoutButtonDropdown = document.getElementById('logout-button-dropdown');

    if (!userMenuButton || !userDropdownMenu || !logoutButtonDropdown) {
        console.warn('Elementos do dropdown do usuário não encontrados.');
        return;
    }

    userMenuButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Impede que o clique feche o menu imediatamente
        userDropdownMenu.classList.toggle('hidden');
    });

    // Fechar dropdown se clicar fora
    document.addEventListener('click', (event) => {
        if (!userMenuButton.contains(event.target) && !userDropdownMenu.contains(event.target)) {
            userDropdownMenu.classList.add('hidden');
        }
    });

    // Fechar dropdown ao clicar em um item do menu (link de navegação)
    userDropdownMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            userDropdownMenu.classList.add('hidden');
            // A navegação será tratada pelo handleHashChange
        });
    });

    // Logout pelo botão do dropdown
    logoutButtonDropdown.addEventListener('click', async () => {
        userDropdownMenu.classList.add('hidden');
        await AuthSystem.logoutUser();
        // UI será atualizada pelo onAuthStateChanged
    });
}

// Função para lidar com a navegação SPA baseada em Hash
function handleHashChange() {
    const hash = window.location.hash.substring(1) || 'home'; // Default to 'home'
    console.log(`[handleHashChange] Navegando para: ${hash}`);

    // Esconder todas as seções principais e de usuário primeiro
    document.querySelectorAll('main > section, .user-section').forEach(section => {
        section.style.display = 'none';
    });

    // Fechar menu mobile se estiver aberto
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.add('hidden');
        document.getElementById('mobile-menu-button').setAttribute('aria-expanded', 'false');
    }

    // Seções que requerem login
    const protectedSections = ['dashboard', 'profile', 'my-courses', 'settings'];

    if (protectedSections.includes(hash)) {
        if (AuthSystem.currentUser) {
            // Usuário logado, carrega a seção apropriada
            switch (hash) {
                case 'dashboard':
                    displayUserDashboard();
                    break;
                case 'profile':
                    displayUserProfile();
                    break;
                case 'my-courses':
                    displayUserCourses();
                    break;
                case 'settings':
                    displayUserSettings();
                    break;
            }
        } else {
            // Usuário não logado tentando acessar seção protegida
            console.warn(`[handleHashChange] Acesso negado à seção protegida: ${hash}. Redirecionando para login.`);
            window.location.hash = '#login'; // Redireciona para a página de login
            // Mostra a seção de login explicitamente caso o redirecionamento falhe ou seja rápido demais
            showSection('login');
        }
    } else {
        // Seção pública ou não encontrada (tratar como pública/home)
        const targetSection = document.getElementById(hash);
        if (targetSection) {
            showSection(hash);
            // Carregar dados dinâmicos para seções públicas se necessário (ex: cursos)
            if (hash === 'courses') {
                displayPublicCourses(); // Precisa criar esta função se não existir
            }
            // Adicionar outras chamadas para carregar dados de seções públicas aqui
        } else {
            console.warn(`[handleHashChange] Seção #${hash} não encontrada. Exibindo #home.`);
            showSection('home');
            window.location.hash = '#home'; // Corrige o hash na URL
        }
    }
}

// Função para exibir cursos na seção pública #courses (Exemplo)
async function displayPublicCourses() {
    const coursesContainer = document.getElementById('public-courses-container'); // Precisa existir no HTML
    if (!coursesContainer) {
        console.warn('[displayPublicCourses] Container #public-courses-container não encontrado.');
        return;
    }
    coursesContainer.innerHTML = '<p class="text-light-tertiary text-center animate-pulse">Carregando cursos...</p>';
    try {
        const courses = await CourseSystem.getAllCourses(); // Ou getFeaturedCourses, dependendo da seção
        let coursesHTML = '';
        if (courses.length === 0) {
            coursesHTML = '<p class="text-light-tertiary text-center">Nenhum curso disponível no momento.</p>';
        } else {
            courses.forEach((course, index) => {
                coursesHTML += `
                    <div class="course-card bg-dark-card rounded-xl shadow-lg overflow-hidden flex flex-col neon-border animate-on-scroll delay-${(index % 3) * 200}ms">
                        <img src="${course.imageUrl || 'images/placeholder-course.jpg'}" alt="${course.title}" class="w-full h-48 object-cover lazy-load">
                        <div class="p-6 flex flex-col flex-grow">
                            <h3 class="text-xl font-semibold mb-2 text-light-primary">${course.title}</h3>
                            <p class="text-light-tertiary text-sm mb-4 flex-grow">${course.description ? course.description.substring(0, 100) + '...' : 'Veja mais detalhes.'}</p>
                            <a href="#course-detail?id=${course.id}" class="mt-auto block w-full text-center bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">
                                Ver Detalhes
                            </a>
                        </div>
                    </div>
                `; // Adapte o link/botão conforme necessário
            });
        }
        coursesContainer.innerHTML = coursesHTML;
        if (typeof initLazyLoading === "function") initLazyLoading();
        if (typeof initScrollAnimations === "function") initScrollAnimations();
    } catch (error) {
        console.error("[displayPublicCourses] Erro ao carregar cursos públicos:", error);
        coursesContainer.innerHTML = '<p class="text-red-500 text-center">Erro ao carregar cursos.</p>';
    }
}

// Função para exibir alertas customizados
function showCustomAlert(message, type = 'info') {
    const alertContainer = document.getElementById('custom-alert-container');
    if (!alertContainer) {
        // Cria o container se não existir
        const container = document.createElement('div');
        container.id = 'custom-alert-container';
        container.style.position = 'fixed';
        container.style.top = '80px'; // Abaixo do header fixo
        container.style.right = '20px';
        container.style.zIndex = '1050'; // Acima de outros elementos
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
        alertContainer = container;
    }

    const alertDiv = document.createElement('div');
    alertDiv.className = `custom-alert ${type === 'success' ? 'custom-alert-success' : type === 'error' ? 'custom-alert-error' : 'custom-alert-info'}`;
    alertDiv.textContent = message;
    alertDiv.style.display = 'block'; // Garante que está visível
    alertDiv.style.opacity = '1';
    alertDiv.style.transition = 'opacity 0.5s ease-out';

    alertContainer.appendChild(alertDiv);

    // Remover alerta após alguns segundos
    setTimeout(() => {
        alertDiv.style.opacity = '0';
        setTimeout(() => {
            alertDiv.remove();
            // Remove o container se estiver vazio
            if (alertContainer.children.length === 0) {
                alertContainer.remove();
            }
        }, 500); // Tempo para a animação de fade-out
    }, 5000); // Tempo que o alerta fica visível
}

// Inicialização de outras funcionalidades (Lazy Loading, Animações, etc.)
function initLazyLoading() { /* ... código original ... */ }
function initScrollAnimations() { /* ... código original ... */ }

// ============================================================================
// INICIALIZAÇÃO E EVENT LISTENERS GLOBAIS
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM totalmente carregado e analisado.');

    // Inicializa o observador de autenticação
    AuthSystem.initAuthObserver();

    // Configura o dropdown do usuário
    setupUserDropdown();

    // Listener para mudanças de Hash na URL
    window.addEventListener('hashchange', handleHashChange);
    // Chama handleHashChange na carga inicial para tratar o hash existente ou default
    handleHashChange();

    // Listener para o botão do menu mobile
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            const isExpanded = mobileMenuButton.getAttribute('aria-expanded') === 'true';
            mobileMenu.classList.toggle('hidden');
            mobileMenuButton.setAttribute('aria-expanded', !isExpanded);
        });
    }

    // --- Listeners para Formulários --- 

    // Formulário de Login
    const loginForm = document.getElementById('login-form'); // Precisa ter ID no HTML
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginForm.email.value;
            const password = loginForm.password.value;
            try {
                await AuthSystem.loginUser(email, password);
                // Sucesso: onAuthStateChanged cuidará da UI e redirecionamento
            } catch (error) {
                // Erro já tratado em loginUser com showCustomAlert
            }
        });
    }

    // Botão Login com Google
    const googleLoginButton = document.getElementById('google-login-button'); // Precisa ter ID no HTML
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', async () => {
            try {
                await AuthSystem.loginWithGoogle();
                // Sucesso: onAuthStateChanged cuidará da UI e redirecionamento
            } catch (error) {
                // Erro já tratado em loginWithGoogle com showCustomAlert
            }
        });
    }

    // Formulário de Registro
    const registerForm = document.getElementById('register-form'); // Precisa ter ID no HTML
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = registerForm.name.value;
            const email = registerForm.email.value;
            const password = registerForm.password.value;
            const confirmPassword = registerForm.confirmPassword.value;
            if (password !== confirmPassword) {
                showCustomAlert('As senhas não coincidem!', 'error');
                return;
            }
            try {
                await AuthSystem.registerUser(name, email, password);
                // Sucesso: onAuthStateChanged cuidará da UI e redirecionamento
            } catch (error) {
                // Erro já tratado em registerUser com showCustomAlert
            }
        });
    }

    // Formulário de Reset de Senha
    const resetPasswordForm = document.getElementById('reset-password-form'); // Precisa ter ID no HTML
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = resetPasswordForm.email.value;
            try {
                await AuthSystem.resetPassword(email);
                resetPasswordForm.reset();
            } catch (error) {
                // Erro já tratado em resetPassword com showCustomAlert
            }
        });
    }

    // Formulário de Atualização de Perfil
    const profileForm = document.getElementById('profile-form'); // Precisa ter ID no HTML
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!AuthSystem.currentUser) return;
            const name = profileForm.name.value;
            // Adicionar outros campos se forem editáveis (ex: photoURL)
            const profileData = { name };
            try {
                await AuthSystem.updateUserProfile(AuthSystem.currentUser.uid, profileData);
            } catch (error) {
                // Erro já tratado em updateUserProfile
            }
        });
    }

    // Formulário de Mudança de Senha
    const changePasswordForm = document.getElementById('change-password-form'); // Precisa ter ID no HTML
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!AuthSystem.currentUser) return;
            const newPassword = changePasswordForm.newPassword.value;
            const confirmPassword = changePasswordForm.confirmPassword.value;
            if (newPassword !== confirmPassword) {
                showCustomAlert('As novas senhas não coincidem!', 'error');
                return;
            }
            if (newPassword.length < 6) {
                 showCustomAlert('A nova senha deve ter pelo menos 6 caracteres.', 'error');
                return;
            }
            try {
                await AuthSystem.currentUser.updatePassword(newPassword);
                showCustomAlert('Senha alterada com sucesso!', 'success');
                changePasswordForm.reset();
            } catch (error) {
                console.error("Erro ao alterar senha:", error);
                showCustomAlert(`Erro ao alterar senha: ${error.message}. Pode ser necessário fazer login novamente.`, 'error');
                // Pode ser necessário reautenticar para mudar a senha, tratar erro 'auth/requires-recent-login'
            }
        });
    }

    // Inicializar funcionalidades visuais
    if (typeof initLazyLoading === "function") initLazyLoading();
    if (typeof initScrollAnimations === "function") initScrollAnimations();

    console.log('Inicialização completa.');
});

