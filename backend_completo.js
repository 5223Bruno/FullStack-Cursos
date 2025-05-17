/**
 * BACKEND COMPLETO PARA O SITE TECHFLIX
 * 
 * Este arquivo contém todas as funcionalidades de back-end necessárias para o site,
 * incluindo autenticação, gerenciamento de cursos, pagamentos, área do aluno e administração.
 * 
 * INSTRUÇÕES DE INTEGRAÇÃO:
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

// Importe o SDK do Firebase (adicione estes scripts ao seu HTML)
// <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-auth-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-storage-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/9.6.0/firebase-functions-compat.js"></script>

// Configuração do Firebase (substitua pelos seus dados)
const firebaseConfig = {
  apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es",
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
  // Estado do usuário atual
  currentUser: null,

  // Observador de estado de autenticação
  initAuthObserver: function() {
    auth.onAuthStateChanged(user => {
      if (user) {
        this.currentUser = user;
        this.getUserProfile(user.uid).then(profile => {
          // Atualizar interface para usuário logado
          this.updateUIForLoggedUser(profile);
        });
      } else {
        this.currentUser = null;
        // Atualizar interface para usuário deslogado
        this.updateUIForLoggedOutUser();
      }
    });
  },

  // Registro de novo usuário
  registerUser: async function(name, email, password) {
    try {
      // Criar usuário no Firebase Auth
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      // Atualizar perfil com nome
      await user.updateProfile({
        displayName: name
      });
      
      // Criar documento de perfil no Firestore
      await db.collection('users').doc(user.uid).set({
        name: name,
        email: email,
        role: 'student', // Papel padrão: estudante
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        courses: [], // Cursos matriculados
        completedLessons: {} // Lições completadas
      });
      
      // Enviar email de verificação
      await user.sendEmailVerification();
      
      return user;
    } catch (error) {
      console.error("Erro no registro:", error);
      throw error;
    }
  },

  // Login de usuário
  loginUser: async function(email, password) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      return userCredential.user;
    } catch (error) {
      console.error("Erro no login:", error);
      throw error;
    }
  },

  // Login com Google
  loginWithGoogle: async function() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      const userCredential = await auth.signInWithPopup(provider);
      const user = userCredential.user;
      
      // Verificar se o usuário já existe no Firestore
      const userDoc = await db.collection('users').doc(user.uid).get();
      
      if (!userDoc.exists) {
        // Criar perfil para novo usuário do Google
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

  // Logout
  logoutUser: async function() {
    try {
      await auth.signOut();
      // Redirecionar para página inicial ou login
      window.location.href = '#home';
    } catch (error) {
      console.error("Erro no logout:", error);
      throw error;
    }
  },

  // Recuperação de senha
  resetPassword: async function(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      return true;
    } catch (error) {
      console.error("Erro na recuperação de senha:", error);
      throw error;
    }
  },

  // Obter perfil do usuário
  getUserProfile: async function(userId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        return userDoc.data();
      } else {
        throw new Error("Perfil de usuário não encontrado");
      }
    } catch (error) {
      console.error("Erro ao obter perfil:", error);
      throw error;
    }
  },

  // Atualizar perfil do usuário
  updateUserProfile: async function(userId, profileData) {
    try {
      await db.collection('users').doc(userId).update(profileData);
      return true;
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      throw error;
    }
  },

  // Verificar se usuário é admin
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

  // Atualizar UI para usuário logado
  updateUIForLoggedUser: function(profile) {
    // Esconder botões de login/registro
    document.querySelectorAll('.login-btn').forEach(el => el.style.display = 'none');
    
    // Mostrar elementos da área do usuário
    document.querySelectorAll('.user-area').forEach(el => el.style.display = 'block');
    
    // Atualizar nome do usuário onde necessário
    document.querySelectorAll('.user-name').forEach(el => {
      el.textContent = profile.name;
    });
    
    // Se for admin, mostrar link para painel admin
    if (profile.role === 'admin') {
      document.querySelectorAll('.admin-link').forEach(el => el.style.display = 'block');
    } else {
      document.querySelectorAll('.admin-link').forEach(el => el.style.display = 'none');
    }
  },

  // Atualizar UI para usuário deslogado
  updateUIForLoggedOutUser: function() {
    // Mostrar botões de login/registro
    document.querySelectorAll('.login-btn').forEach(el => el.style.display = 'block');
    
    // Esconder elementos da área do usuário
    document.querySelectorAll('.user-area').forEach(el => el.style.display = 'none');
    
    // Esconder link para painel admin
    document.querySelectorAll('.admin-link').forEach(el => el.style.display = 'none');
  }
};

// ============================================================================
// SISTEMA DE GERENCIAMENTO DE CURSOS
// ============================================================================

const CourseSystem = {
  // Obter todos os cursos
  getAllCourses: async function() {
    try {
      const coursesSnapshot = await db.collection('courses').get();
      return coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Erro ao obter cursos:", error);
      throw error;
    }
  },

  // Obter cursos em destaque
  getFeaturedCourses: async function() {
    try {
      const coursesSnapshot = await db.collection('courses')
        .where('featured', '==', true)
        .limit(6)
        .get();
      
      return coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Erro ao obter cursos em destaque:", error);
      throw error;
    }
  },

  // Obter detalhes de um curso específico
  getCourseDetails: async function(courseId) {
    try {
      const courseDoc = await db.collection('courses').doc(courseId).get();
      
      if (!courseDoc.exists) {
        throw new Error("Curso não encontrado");
      }
      
      // Obter módulos e aulas do curso
      const modulesSnapshot = await db.collection('courses')
        .doc(courseId)
        .collection('modules')
        .orderBy('order')
        .get();
      
      const modules = [];
      
      for (const moduleDoc of modulesSnapshot.docs) {
        const moduleData = {
          id: moduleDoc.id,
          ...moduleDoc.data(),
          lessons: []
        };
        
        // Obter aulas deste módulo
        const lessonsSnapshot = await db.collection('courses')
          .doc(courseId)
          .collection('modules')
          .doc(moduleDoc.id)
          .collection('lessons')
          .orderBy('order')
          .get();
        
        moduleData.lessons = lessonsSnapshot.docs.map(lessonDoc => ({
          id: lessonDoc.id,
          ...lessonDoc.data()
        }));
        
        modules.push(moduleData);
      }
      
      return {
        id: courseDoc.id,
        ...courseDoc.data(),
        modules
      };
    } catch (error) {
      console.error("Erro ao obter detalhes do curso:", error);
      throw error;
    }
  },

  // Adicionar novo curso (admin)
  addCourse: async function(courseData) {
    try {
      // Verificar se usuário é admin
      const isAdmin = await AuthSystem.isAdmin(auth.currentUser.uid);
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Adicionar curso ao Firestore
      const courseRef = await db.collection('courses').add({
        ...courseData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return courseRef.id;
    } catch (error) {
      console.error("Erro ao adicionar curso:", error);
      throw error;
    }
  },

  // Atualizar curso existente (admin)
  updateCourse: async function(courseId, courseData) {
    try {
      // Verificar se usuário é admin
      const isAdmin = await AuthSystem.isAdmin(auth.currentUser.uid);
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Atualizar curso no Firestore
      await db.collection('courses').doc(courseId).update({
        ...courseData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return true;
    } catch (error) {
      console.error("Erro ao atualizar curso:", error);
      throw error;
    }
  },

  // Adicionar módulo a um curso (admin)
  addModule: async function(courseId, moduleData) {
    try {
      // Verificar se usuário é admin
      const isAdmin = await AuthSystem.isAdmin(auth.currentUser.uid);
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Adicionar módulo ao curso
      const moduleRef = await db.collection('courses')
        .doc(courseId)
        .collection('modules')
        .add({
          ...moduleData,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      
      return moduleRef.id;
    } catch (error) {
      console.error("Erro ao adicionar módulo:", error);
      throw error;
    }
  },

  // Adicionar aula a um módulo (admin)
  addLesson: async function(courseId, moduleId, lessonData) {
    try {
      // Verificar se usuário é admin
      const isAdmin = await AuthSystem.isAdmin(auth.currentUser.uid);
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Adicionar aula ao módulo
      const lessonRef = await db.collection('courses')
        .doc(courseId)
        .collection('modules')
        .doc(moduleId)
        .collection('lessons')
        .add({
          ...lessonData,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      
      return lessonRef.id;
    } catch (error) {
      console.error("Erro ao adicionar aula:", error);
      throw error;
    }
  },

  // Upload de vídeo para uma aula (admin)
  uploadLessonVideo: async function(courseId, moduleId, lessonId, videoFile) {
    try {
      // Verificar se usuário é admin
      const isAdmin = await AuthSystem.isAdmin(auth.currentUser.uid);
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Criar referência para o arquivo no Storage
      const videoRef = storage.ref(`courses/${courseId}/modules/${moduleId}/lessons/${lessonId}/video`);
      
      // Fazer upload do arquivo
      const uploadTask = videoRef.put(videoFile);
      
      // Retornar uma Promise que resolve quando o upload for concluído
      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          // Progresso do upload
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log(`Upload: ${progress}% concluído`);
          },
          // Erro no upload
          (error) => {
            console.error("Erro no upload:", error);
            reject(error);
          },
          // Upload concluído com sucesso
          async () => {
            // Obter URL do vídeo
            const videoUrl = await uploadTask.snapshot.ref.getDownloadURL();
            
            // Atualizar aula com URL do vídeo
            await db.collection('courses')
              .doc(courseId)
              .collection('modules')
              .doc(moduleId)
              .collection('lessons')
              .doc(lessonId)
              .update({
                videoUrl: videoUrl
              });
            
            resolve(videoUrl);
          }
        );
      });
    } catch (error) {
      console.error("Erro ao fazer upload de vídeo:", error);
      throw error;
    }
  },

  // Marcar aula como concluída
  markLessonAsCompleted: async function(courseId, moduleId, lessonId) {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Criar caminho para a lição concluída
      const lessonPath = `${courseId}/${moduleId}/${lessonId}`;
      
      // Atualizar documento do usuário
      await db.collection('users').doc(userId).update({
        [`completedLessons.${lessonPath}`]: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      return true;
    } catch (error) {
      console.error("Erro ao marcar aula como concluída:", error);
      throw error;
    }
  },

  // Verificar se aula foi concluída
  isLessonCompleted: async function(courseId, moduleId, lessonId) {
    try {
      if (!auth.currentUser) {
        return false;
      }
      
      const userId = auth.currentUser.uid;
      
      // Obter documento do usuário
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return false;
      }
      
      const userData = userDoc.data();
      const lessonPath = `${courseId}/${moduleId}/${lessonId}`;
      
      // Verificar se a lição está marcada como concluída
      return userData.completedLessons && userData.completedLessons[lessonPath] !== undefined;
    } catch (error) {
      console.error("Erro ao verificar conclusão da aula:", error);
      return false;
    }
  },

  // Obter progresso do aluno em um curso
  getCourseProgress: async function(courseId) {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Obter detalhes do curso (incluindo módulos e aulas)
      const courseDetails = await this.getCourseDetails(courseId);
      
      // Obter documento do usuário
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        throw new Error("Usuário não encontrado");
      }
      
      const userData = userDoc.data();
      
      // Contar total de aulas e aulas concluídas
      let totalLessons = 0;
      let completedLessons = 0;
      
      // Para cada módulo no curso
      for (const module of courseDetails.modules) {
        // Para cada aula no módulo
        for (const lesson of module.lessons) {
          totalLessons++;
          
          // Verificar se a aula foi concluída
          const lessonPath = `${courseId}/${module.id}/${lesson.id}`;
          if (userData.completedLessons && userData.completedLessons[lessonPath]) {
            completedLessons++;
          }
        }
      }
      
      // Calcular porcentagem de conclusão
      const progressPercentage = totalLessons > 0 
        ? Math.round((completedLessons / totalLessons) * 100) 
        : 0;
      
      return {
        totalLessons,
        completedLessons,
        progressPercentage
      };
    } catch (error) {
      console.error("Erro ao obter progresso do curso:", error);
      throw error;
    }
  },

  // Buscar cursos
  searchCourses: async function(query) {
    try {
      // Obter todos os cursos (em uma aplicação real, usaríamos Algolia ou outro serviço de busca)
      const coursesSnapshot = await db.collection('courses').get();
      
      // Filtrar cursos que correspondem à consulta
      const courses = coursesSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(course => {
          const searchableText = `${course.title} ${course.description} ${course.tags?.join(' ') || ''}`.toLowerCase();
          return searchableText.includes(query.toLowerCase());
        });
      
      return courses;
    } catch (error) {
      console.error("Erro na busca de cursos:", error);
      throw error;
    }
  }
};

// ============================================================================
// SISTEMA DE PAGAMENTOS
// ============================================================================

const PaymentSystem = {
  // Inicializar Stripe (adicione o script do Stripe ao seu HTML)
  // <script src="https://js.stripe.com/v3/"></script>
  
  // Chave pública do Stripe (substitua pela sua)
  stripePublicKey: 'pk_test_sua_chave_publica_stripe',
  
  // Inicializar Stripe
  stripe: null,
  elements: null,
  
  init: function() {
    this.stripe = Stripe(this.stripePublicKey);
    this.elements = this.stripe.elements();
  },
  
  // Criar formulário de pagamento
  createPaymentForm: function(containerId) {
    // Criar elemento de cartão
    const cardElement = this.elements.create('card', {
      style: {
        base: {
          color: '#f8fafc',
          fontFamily: '"Inter", sans-serif',
          fontSmoothing: 'antialiased',
          fontSize: '16px',
          '::placeholder': {
            color: '#94a3b8'
          }
        },
        invalid: {
          color: '#ef4444',
          iconColor: '#ef4444'
        }
      }
    });
    
    // Montar elemento de cartão no container
    cardElement.mount(`#${containerId}`);
    
    return cardElement;
  },
  
  // Processar pagamento único
  processPayment: async function(cardElement, amount, courseId) {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Criar intent de pagamento no servidor (via Cloud Function)
      const createPaymentIntentFunc = functions.httpsCallable('createPaymentIntent');
      const result = await createPaymentIntentFunc({
        amount: amount,
        courseId: courseId
      });
      
      const clientSecret = result.data.clientSecret;
      
      // Confirmar pagamento com Stripe
      const paymentResult = await this.stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            email: auth.currentUser.email
          }
        }
      });
      
      if (paymentResult.error) {
        throw new Error(paymentResult.error.message);
      }
      
      if (paymentResult.paymentIntent.status === 'succeeded') {
        // Registrar compra no Firestore
        await db.collection('purchases').add({
          userId: userId,
          courseId: courseId,
          amount: amount,
          paymentIntentId: paymentResult.paymentIntent.id,
          status: 'completed',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Adicionar curso à lista de cursos do usuário
        await db.collection('users').doc(userId).update({
          courses: firebase.firestore.FieldValue.arrayUnion(courseId)
        });
        
        return {
          success: true,
          paymentIntentId: paymentResult.paymentIntent.id
        };
      } else {
        throw new Error("Pagamento não foi concluído");
      }
    } catch (error) {
      console.error("Erro no processamento do pagamento:", error);
      throw error;
    }
  },
  
  // Verificar se usuário tem acesso a um curso
  checkCourseAccess: async function(courseId) {
    try {
      if (!auth.currentUser) {
        return false;
      }
      
      const userId = auth.currentUser.uid;
      
      // Obter documento do usuário
      const userDoc = await db.collection('users').doc(userId).get();
      
      if (!userDoc.exists) {
        return false;
      }
      
      const userData = userDoc.data();
      
      // Verificar se o curso está na lista de cursos do usuário
      return userData.courses && userData.courses.includes(courseId);
    } catch (error) {
      console.error("Erro ao verificar acesso ao curso:", error);
      return false;
    }
  },
  
  // Obter histórico de compras do usuário
  getPurchaseHistory: async function() {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Obter compras do usuário
      const purchasesSnapshot = await db.collection('purchases')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();
      
      const purchases = [];
      
      for (const purchaseDoc of purchasesSnapshot.docs) {
        const purchaseData = {
          id: purchaseDoc.id,
          ...purchaseDoc.data()
        };
        
        // Obter detalhes do curso
        const courseDoc = await db.collection('courses').doc(purchaseData.courseId).get();
        
        if (courseDoc.exists) {
          purchaseData.course = {
            id: courseDoc.id,
            title: courseDoc.data().title,
            imageUrl: courseDoc.data().imageUrl
          };
        }
        
        purchases.push(purchaseData);
      }
      
      return purchases;
    } catch (error) {
      console.error("Erro ao obter histórico de compras:", error);
      throw error;
    }
  }
};

// ============================================================================
// SISTEMA DE ADMINISTRAÇÃO
// ============================================================================

const AdminSystem = {
  // Verificar se usuário atual é admin
  checkAdminAccess: async function() {
    try {
      if (!auth.currentUser) {
        return false;
      }
      
      return await AuthSystem.isAdmin(auth.currentUser.uid);
    } catch (error) {
      console.error("Erro ao verificar acesso de admin:", error);
      return false;
    }
  },
  
  // Obter estatísticas gerais
  getDashboardStats: async function() {
    try {
      // Verificar permissão
      const isAdmin = await this.checkAdminAccess();
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Obter contagem de usuários
      const usersSnapshot = await db.collection('users').get();
      const totalUsers = usersSnapshot.size;
      
      // Obter contagem de cursos
      const coursesSnapshot = await db.collection('courses').get();
      const totalCourses = coursesSnapshot.size;
      
      // Obter contagem de compras
      const purchasesSnapshot = await db.collection('purchases').get();
      const totalPurchases = purchasesSnapshot.size;
      
      // Calcular receita total
      let totalRevenue = 0;
      purchasesSnapshot.docs.forEach(doc => {
        const purchaseData = doc.data();
        if (purchaseData.status === 'completed') {
          totalRevenue += purchaseData.amount;
        }
      });
      
      return {
        totalUsers,
        totalCourses,
        totalPurchases,
        totalRevenue
      };
    } catch (error) {
      console.error("Erro ao obter estatísticas:", error);
      throw error;
    }
  },
  
  // Obter lista de usuários (com paginação)
  getUsers: async function(limit = 10, startAfter = null) {
    try {
      // Verificar permissão
      const isAdmin = await this.checkAdminAccess();
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      let query = db.collection('users')
        .orderBy('createdAt', 'desc')
        .limit(limit);
      
      // Se tiver um ponto de partida para paginação
      if (startAfter) {
        const startAfterDoc = await db.collection('users').doc(startAfter).get();
        if (startAfterDoc.exists) {
          query = query.startAfter(startAfterDoc);
        }
      }
      
      const usersSnapshot = await query.get();
      
      return usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Erro ao obter usuários:", error);
      throw error;
    }
  },
  
  // Atualizar papel de um usuário (aluno, instrutor, admin)
  updateUserRole: async function(userId, newRole) {
    try {
      // Verificar permissão
      const isAdmin = await this.checkAdminAccess();
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Validar papel
      const validRoles = ['student', 'instructor', 'admin'];
      if (!validRoles.includes(newRole)) {
        throw new Error("Papel inválido");
      }
      
      // Atualizar papel do usuário
      await db.collection('users').doc(userId).update({
        role: newRole
      });
      
      return true;
    } catch (error) {
      console.error("Erro ao atualizar papel do usuário:", error);
      throw error;
    }
  },
  
  // Obter relatório de vendas por período
  getSalesReport: async function(startDate, endDate) {
    try {
      // Verificar permissão
      const isAdmin = await this.checkAdminAccess();
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Converter datas para timestamps do Firestore
      const startTimestamp = firebase.firestore.Timestamp.fromDate(new Date(startDate));
      const endTimestamp = firebase.firestore.Timestamp.fromDate(new Date(endDate));
      
      // Obter compras no período
      const purchasesSnapshot = await db.collection('purchases')
        .where('createdAt', '>=', startTimestamp)
        .where('createdAt', '<=', endTimestamp)
        .where('status', '==', 'completed')
        .get();
      
      // Agrupar vendas por curso
      const salesByCourse = {};
      
      for (const purchaseDoc of purchasesSnapshot.docs) {
        const purchaseData = purchaseDoc.data();
        const courseId = purchaseData.courseId;
        
        if (!salesByCourse[courseId]) {
          salesByCourse[courseId] = {
            count: 0,
            revenue: 0,
            courseId: courseId
          };
        }
        
        salesByCourse[courseId].count++;
        salesByCourse[courseId].revenue += purchaseData.amount;
      }
      
      // Converter para array e adicionar detalhes do curso
      const salesReport = [];
      
      for (const courseId in salesByCourse) {
        const courseDoc = await db.collection('courses').doc(courseId).get();
        
        if (courseDoc.exists) {
          salesReport.push({
            ...salesByCourse[courseId],
            courseTitle: courseDoc.data().title
          });
        } else {
          salesReport.push({
            ...salesByCourse[courseId],
            courseTitle: 'Curso não encontrado'
          });
        }
      }
      
      // Ordenar por receita (do maior para o menor)
      salesReport.sort((a, b) => b.revenue - a.revenue);
      
      return salesReport;
    } catch (error) {
      console.error("Erro ao gerar relatório de vendas:", error);
      throw error;
    }
  }
};

// ============================================================================
// SISTEMA DE NOTIFICAÇÕES
// ============================================================================

const NotificationSystem = {
  // Obter notificações do usuário
  getUserNotifications: async function() {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Obter notificações do usuário
      const notificationsSnapshot = await db.collection('users')
        .doc(userId)
        .collection('notifications')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      
      return notificationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Erro ao obter notificações:", error);
      throw error;
    }
  },
  
  // Marcar notificação como lida
  markNotificationAsRead: async function(notificationId) {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Atualizar notificação
      await db.collection('users')
        .doc(userId)
        .collection('notifications')
        .doc(notificationId)
        .update({
          read: true,
          readAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      
      return true;
    } catch (error) {
      console.error("Erro ao marcar notificação como lida:", error);
      throw error;
    }
  },
  
  // Enviar notificação para um usuário (admin)
  sendNotification: async function(userId, notification) {
    try {
      // Verificar permissão
      const isAdmin = await AdminSystem.checkAdminAccess();
      if (!isAdmin) {
        throw new Error("Permissão negada");
      }
      
      // Adicionar notificação
      await db.collection('users')
        .doc(userId)
        .collection('notifications')
        .add({
          ...notification,
          read: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      
      return true;
    } catch (error) {
      console.error("Erro ao enviar notificação:", error);
      throw error;
    }
  }
};

// ============================================================================
// SISTEMA DE AVALIAÇÕES E COMENTÁRIOS
// ============================================================================

const ReviewSystem = {
  // Adicionar avaliação a um curso
  addReview: async function(courseId, rating, comment) {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Verificar se usuário tem acesso ao curso
      const hasAccess = await PaymentSystem.checkCourseAccess(courseId);
      if (!hasAccess) {
        throw new Error("Você precisa estar matriculado no curso para avaliá-lo");
      }
      
      // Obter nome do usuário
      const userDoc = await db.collection('users').doc(userId).get();
      const userName = userDoc.exists ? userDoc.data().name : 'Usuário';
      
      // Adicionar avaliação
      await db.collection('courses')
        .doc(courseId)
        .collection('reviews')
        .add({
          userId: userId,
          userName: userName,
          rating: rating,
          comment: comment,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      
      // Atualizar média de avaliações do curso
      await this.updateCourseRating(courseId);
      
      return true;
    } catch (error) {
      console.error("Erro ao adicionar avaliação:", error);
      throw error;
    }
  },
  
  // Obter avaliações de um curso
  getCourseReviews: async function(courseId) {
    try {
      // Obter avaliações
      const reviewsSnapshot = await db.collection('courses')
        .doc(courseId)
        .collection('reviews')
        .orderBy('createdAt', 'desc')
        .get();
      
      return reviewsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Erro ao obter avaliações:", error);
      throw error;
    }
  },
  
  // Atualizar média de avaliações de um curso
  updateCourseRating: async function(courseId) {
    try {
      // Obter todas as avaliações do curso
      const reviewsSnapshot = await db.collection('courses')
        .doc(courseId)
        .collection('reviews')
        .get();
      
      // Calcular média
      let totalRating = 0;
      const numReviews = reviewsSnapshot.size;
      
      reviewsSnapshot.docs.forEach(doc => {
        totalRating += doc.data().rating;
      });
      
      const averageRating = numReviews > 0 ? totalRating / numReviews : 0;
      
      // Atualizar curso com nova média
      await db.collection('courses').doc(courseId).update({
        averageRating: averageRating,
        numReviews: numReviews
      });
      
      return {
        averageRating,
        numReviews
      };
    } catch (error) {
      console.error("Erro ao atualizar média de avaliações:", error);
      throw error;
    }
  }
};

// ============================================================================
// SISTEMA DE CERTIFICADOS
// ============================================================================

const CertificateSystem = {
  // Verificar se usuário completou o curso
  checkCourseCompletion: async function(courseId) {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      // Obter progresso do curso
      const progress = await CourseSystem.getCourseProgress(courseId);
      
      // Verificar se todas as aulas foram concluídas
      return progress.totalLessons > 0 && progress.completedLessons === progress.totalLessons;
    } catch (error) {
      console.error("Erro ao verificar conclusão do curso:", error);
      throw error;
    }
  },
  
  // Gerar certificado
  generateCertificate: async function(courseId) {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Verificar se o curso foi concluído
      const isCompleted = await this.checkCourseCompletion(courseId);
      if (!isCompleted) {
        throw new Error("Você precisa concluir todas as aulas para receber o certificado");
      }
      
      // Verificar se já existe certificado
      const certificateQuery = await db.collection('certificates')
        .where('userId', '==', userId)
        .where('courseId', '==', courseId)
        .get();
      
      if (!certificateQuery.empty) {
        // Retornar certificado existente
        return {
          id: certificateQuery.docs[0].id,
          ...certificateQuery.docs[0].data()
        };
      }
      
      // Obter detalhes do usuário
      const userDoc = await db.collection('users').doc(userId).get();
      const userName = userDoc.exists ? userDoc.data().name : 'Aluno';
      
      // Obter detalhes do curso
      const courseDoc = await db.collection('courses').doc(courseId).get();
      const courseTitle = courseDoc.exists ? courseDoc.data().title : 'Curso';
      
      // Gerar código único para o certificado
      const certificateCode = `CERT-${userId.substring(0, 4)}-${courseId.substring(0, 4)}-${Date.now().toString(36)}`;
      
      // Criar certificado
      const certificateRef = await db.collection('certificates').add({
        userId: userId,
        userName: userName,
        courseId: courseId,
        courseTitle: courseTitle,
        certificateCode: certificateCode,
        issueDate: firebase.firestore.FieldValue.serverTimestamp(),
        verified: true
      });
      
      return {
        id: certificateRef.id,
        userId: userId,
        userName: userName,
        courseId: courseId,
        courseTitle: courseTitle,
        certificateCode: certificateCode,
        issueDate: new Date()
      };
    } catch (error) {
      console.error("Erro ao gerar certificado:", error);
      throw error;
    }
  },
  
  // Obter certificados do usuário
  getUserCertificates: async function() {
    try {
      if (!auth.currentUser) {
        throw new Error("Usuário não autenticado");
      }
      
      const userId = auth.currentUser.uid;
      
      // Obter certificados
      const certificatesSnapshot = await db.collection('certificates')
        .where('userId', '==', userId)
        .orderBy('issueDate', 'desc')
        .get();
      
      return certificatesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error("Erro ao obter certificados:", error);
      throw error;
    }
  },
  
  // Verificar autenticidade de um certificado
  verifyCertificate: async function(certificateCode) {
    try {
      // Buscar certificado pelo código
      const certificateQuery = await db.collection('certificates')
        .where('certificateCode', '==', certificateCode)
        .get();
      
      if (certificateQuery.empty) {
        return {
          valid: false,
          message: "Certificado não encontrado"
        };
      }
      
      const certificateData = certificateQuery.docs[0].data();
      
      return {
        valid: certificateData.verified === true,
        certificate: {
          userName: certificateData.userName,
          courseTitle: certificateData.courseTitle,
          issueDate: certificateData.issueDate.toDate()
        }
      };
    } catch (error) {
      console.error("Erro ao verificar certificado:", error);
      throw error;
    }
  }
};

// ============================================================================
// INICIALIZAÇÃO E EVENTOS
// ============================================================================

// Inicializar sistemas quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar sistema de autenticação
  AuthSystem.initAuthObserver();
  
  // Inicializar sistema de pagamentos
  PaymentSystem.init();
  
  // Carregar cursos em destaque na página inicial
  if (document.getElementById('featured-courses')) {
    CourseSystem.getFeaturedCourses()
      .then(courses => {
        displayFeaturedCourses(courses);
      })
      .catch(error => {
        console.error("Erro ao carregar cursos em destaque:", error);
      });
  }
  
  // Configurar formulário de login
  setupLoginForm();
  
  // Configurar formulário de registro
  setupRegisterForm();
  
  // Configurar formulário de contato
  setupContactForm();
  
  // Configurar busca de cursos
  setupCourseSearch();
});

// Função para exibir cursos em destaque
function displayFeaturedCourses(courses) {
  const container = document.getElementById('featured-courses');
  if (!container) return;
  
  // Limpar container
  container.innerHTML = '';
  
  // Adicionar cada curso
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
          <p class="text-lg font-bold text-accent-indigo-primary">R$ ${course.price.toFixed(2)}</p>
          <span class="text-sm text-light-tertiary">
            <i class="fas fa-star mr-1 text-yellow-400"></i> 
            ${course.averageRating ? course.averageRating.toFixed(1) : '0.0'}
            (${course.numReviews || 0})
          </span>
        </div>
        <a href="#course-detail-${course.id}" 
           class="mt-auto block w-full text-center bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">
          Ver Detalhes
        </a>
      </div>
    `;
    
    container.appendChild(courseElement);
  });
}

// Configurar formulário de login
function setupLoginForm() {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) return;
  
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    AuthSystem.loginUser(email, password)
      .then(() => {
        showCustomAlert('Login realizado com sucesso!', 'success');
        // Redirecionar para área do aluno ou página inicial
        window.location.href = '#dashboard';
      })
      .catch(error => {
        showCustomAlert(`Erro no login: ${error.message}`, 'error');
      });
  });
  
  // Botão de login com Google
  const googleLoginBtn = document.getElementById('google-login-btn');
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', function() {
      AuthSystem.loginWithGoogle()
        .then(() => {
          showCustomAlert('Login com Google realizado com sucesso!', 'success');
          // Redirecionar para área do aluno ou página inicial
          window.location.href = '#dashboard';
        })
        .catch(error => {
          showCustomAlert(`Erro no login com Google: ${error.message}`, 'error');
        });
    });
  }
  
  // Link de recuperação de senha
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', function(e) {
      e.preventDefault();
      
      const email = prompt('Digite seu email para recuperar a senha:');
      if (email) {
        AuthSystem.resetPassword(email)
          .then(() => {
            showCustomAlert('Email de recuperação enviado. Verifique sua caixa de entrada.', 'success');
          })
          .catch(error => {
            showCustomAlert(`Erro ao enviar email de recuperação: ${error.message}`, 'error');
          });
      }
    });
  }
}

// Configurar formulário de registro
function setupRegisterForm() {
  const registerForm = document.getElementById('register-form');
  if (!registerForm) return;
  
  registerForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    AuthSystem.registerUser(name, email, password)
      .then(() => {
        showCustomAlert('Registro realizado com sucesso! Verifique seu email para confirmar sua conta.', 'success');
        // Redirecionar para página de login ou dashboard
        window.location.href = '#login';
      })
      .catch(error => {
        showCustomAlert(`Erro no registro: ${error.message}`, 'error');
      });
  });
}

// Configurar formulário de contato
function setupContactForm() {
  const contactForm = document.getElementById('contact-form');
  if (!contactForm) return;
  
  contactForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const message = document.getElementById('contact-message').value;
    
    // Enviar mensagem para o Firestore
    db.collection('contacts').add({
      name: name,
      email: email,
      message: message,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => {
      showCustomAlert('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
      contactForm.reset();
    })
    .catch(error => {
      showCustomAlert(`Erro ao enviar mensagem: ${error.message}`, 'error');
    });
  });
}

// Configurar busca de cursos
function setupCourseSearch() {
  const searchForm = document.getElementById('course-search-form');
  if (!searchForm) return;
  
  searchForm.addEventListener('submit', function(e) {
    e.preventDefault();
    
    const searchQuery = document.getElementById('course-search-input').value;
    
    if (searchQuery.trim() === '') {
      return;
    }
    
    CourseSystem.searchCourses(searchQuery)
      .then(courses => {
        displaySearchResults(courses, searchQuery);
      })
      .catch(error => {
        showCustomAlert(`Erro na busca: ${error.message}`, 'error');
      });
  });
}

// Exibir resultados da busca
function displaySearchResults(courses, query) {
  // Navegar para a seção de resultados
  window.location.href = '#search-results';
  
  const resultsContainer = document.getElementById('search-results-container');
  if (!resultsContainer) return;
  
  // Mostrar seção de resultados
  document.getElementById('search-results').classList.remove('hidden');
  
  // Atualizar título da busca
  const searchTitle = document.getElementById('search-query-text');
  if (searchTitle) {
    searchTitle.textContent = query;
  }
  
  // Limpar resultados anteriores
  resultsContainer.innerHTML = '';
  
  // Se não houver resultados
  if (courses.length === 0) {
    resultsContainer.innerHTML = `
      <div class="text-center py-8">
        <p class="text-light-tertiary">Nenhum curso encontrado para "${query}".</p>
      </div>
    `;
    return;
  }
  
  // Adicionar cada curso aos resultados
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
        <div class="flex justify-between items-center mb-3">
          <p class="text-lg font-bold text-accent-indigo-primary">R$ ${course.price.toFixed(2)}</p>
          <span class="text-sm text-light-tertiary">
            <i class="fas fa-star mr-1 text-yellow-400"></i> 
            ${course.averageRating ? course.averageRating.toFixed(1) : '0.0'}
          </span>
        </div>
        <a href="#course-detail-${course.id}" 
           class="mt-auto block w-full text-center bg-accent-indigo-primary hover:bg-accent-indigo-hover text-white font-semibold py-2 px-4 rounded-lg cta-button">
          Ver Detalhes
        </a>
      </div>
    `;
    
    resultsContainer.appendChild(courseElement);
  });
}

// Exportar sistemas para uso global
window.TechFlixAuth = AuthSystem;
window.TechFlixCourses = CourseSystem;
window.TechFlixPayment = PaymentSystem;
window.TechFlixAdmin = AdminSystem;
window.TechFlixNotifications = NotificationSystem;
window.TechFlixReviews = ReviewSystem;
window.TechFlixCertificates = CertificateSystem;

/**
 * Código para exibir a foto do usuário logado no canto superior direito
 * Este código deve ser adicionado ao seu arquivo backend_completo.js
 */

// Função para atualizar a interface após o login
function updateUserInterface(user) {
  // Elementos que precisamos modificar
  const loginButton = document.querySelector('a[href="#login"]');
  const mobileLoginButton = document.querySelector('#mobile-menu a[href="#login"]');
  
  if (user) {
    // Usuário está logado
    
    // Criar elemento para exibir foto e nome do usuário no menu desktop
    const userProfileDesktop = document.createElement('div');
    userProfileDesktop.className = 'flex items-center cursor-pointer relative group';
    userProfileDesktop.innerHTML = `
      <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email)}" 
           alt="Foto de perfil" 
           class="w-8 h-8 rounded-full border-2 border-accent-indigo-primary mr-2">
      <span class="text-light-primary hidden md:inline">${user.displayName || user.email.split('@')[0]}</span>
      <div class="hidden group-hover:block absolute right-0 top-full mt-2 w-48 bg-dark-card rounded-lg shadow-lg z-50 py-2 border border-gray-700">
        <a href="#profile" class="block px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary">
          <i class="fas fa-user mr-2"></i> Meu Perfil
        </a>
        <a href="#my-courses" class="block px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary">
          <i class="fas fa-graduation-cap mr-2"></i> Meus Cursos
        </a>
        <a href="#settings" class="block px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary">
          <i class="fas fa-cog mr-2"></i> Configurações
        </a>
        <div class="border-t border-gray-700 my-1"></div>
        <a href="#" id="logout-button" class="block px-4 py-2 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary">
          <i class="fas fa-sign-out-alt mr-2"></i> Sair
        </a>
      </div>
    `;
    
    // Substituir o botão de login pela foto do usuário no menu desktop
    if (loginButton) {
      loginButton.parentNode.replaceChild(userProfileDesktop, loginButton);
    }
    
    // Criar elemento para exibir foto e nome do usuário no menu mobile
    const userProfileMobile = document.createElement('div');
    userProfileMobile.className = 'block px-6 py-3 bg-dark-tertiary';
    userProfileMobile.innerHTML = `
      <div class="flex items-center">
        <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email)}" 
             alt="Foto de perfil" 
             class="w-8 h-8 rounded-full border-2 border-accent-indigo-primary mr-2">
        <span class="text-light-primary">${user.displayName || user.email.split('@')[0]}</span>
      </div>
    `;
    
    // Adicionar links do perfil no menu mobile
    const profileLinksMobile = document.createElement('div');
    profileLinksMobile.innerHTML = `
      <a href="#profile" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary pl-10">
        <i class="fas fa-user mr-2"></i> Meu Perfil
      </a>
      <a href="#my-courses" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary pl-10">
        <i class="fas fa-graduation-cap mr-2"></i> Meus Cursos
      </a>
      <a href="#settings" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary pl-10">
        <i class="fas fa-cog mr-2"></i> Configurações
      </a>
      <a href="#" id="logout-button-mobile" class="block px-6 py-3 text-light-secondary hover:bg-dark-tertiary hover:text-light-primary pl-10">
        <i class="fas fa-sign-out-alt mr-2"></i> Sair
      </a>
    `;
    
    // Substituir o botão de login pela foto do usuário no menu mobile
    if (mobileLoginButton) {
      mobileLoginButton.parentNode.replaceChild(userProfileMobile, mobileLoginButton);
      userProfileMobile.parentNode.insertBefore(profileLinksMobile, userProfileMobile.nextSibling);
    }
    
    // Adicionar evento de logout aos botões de sair
    document.getElementById('logout-button').addEventListener('click', (e) => {
      e.preventDefault();
      firebase.auth().signOut().then(() => {
        showCustomAlert('Você saiu com sucesso!', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      });
    });
    
    if (document.getElementById('logout-button-mobile')) {
      document.getElementById('logout-button-mobile').addEventListener('click', (e) => {
        e.preventDefault();
        firebase.auth().signOut().then(() => {
          showCustomAlert('Você saiu com sucesso!', 'success');
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        });
      });
    }
    
  } else {
    // Usuário não está logado - garantir que os botões de login estejam visíveis
    // Isso é útil quando o usuário faz logout
    
    // Se os botões de login foram substituídos, precisamos restaurá-los
    const userProfileDesktop = document.querySelector('.flex.items-center.cursor-pointer.relative.group');
    if (userProfileDesktop && !loginButton) {
      const newLoginButton = document.createElement('a');
      newLoginButton.href = '#login';
      newLoginButton.className = 'gradient-cta text-white px-4 py-2 rounded-lg cta-button';
      newLoginButton.textContent = 'Login';
      userProfileDesktop.parentNode.replaceChild(newLoginButton, userProfileDesktop);
    }
    
    // Restaurar botão de login no menu mobile se necessário
    const userProfileMobile = document.querySelector('#mobile-menu .bg-dark-tertiary');
    if (userProfileMobile && !mobileLoginButton) {
      const newMobileLoginButton = document.createElement('a');
      newMobileLoginButton.href = '#login';
      newMobileLoginButton.className = 'block px-6 py-3 gradient-cta text-white text-center rounded-b-lg';
      newMobileLoginButton.textContent = 'Login';
      
      // Remover também os links do perfil
      const profileLinksMobile = userProfileMobile.nextSibling;
      if (profileLinksMobile) {
        profileLinksMobile.parentNode.removeChild(profileLinksMobile);
      }
      
      userProfileMobile.parentNode.replaceChild(newMobileLoginButton, userProfileMobile);
    }
  }
}

// Adicionar listener para mudanças no estado de autenticação
firebase.auth().onAuthStateChanged((user) => {
  updateUserInterface(user);
});

// Verificar se o usuário já está logado quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
  const user = firebase.auth().currentUser;
  if (user) {
    updateUserInterface(user);
  }
});

