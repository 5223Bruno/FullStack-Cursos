const firebaseConfig = {
    apiKey: "AIzaSyB3IPLPzZpJtWJRmf-C466P4mu1fXa05es",
    authDomain: "fullstackcursos-a1f5b.firebaseapp.com",
    projectId: "fullstackcursos-a1f5b",
    storageBucket: "fullstackcursos-a1f5b.appspot.com",
    messagingSenderId: "637982443957",
    appId: "1:637982443957:web:1cfa44a6d2065b57c3b92d"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Adicionar curso
document.getElementById('add-course-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const courseTitle = document.getElementById('course-title').value.trim();
    const courseLink = document.getElementById('course-link').value.trim();
    const courseImage = document.getElementById('course-image').value.trim();

    if (!courseTitle || !courseLink || !courseImage) {
        alert('Por favor, preencha todos os campos.');
        return;
    }

    try {
        await db.collection('courses').add({
            title: courseTitle,
            link: courseLink,
            image: courseImage
        });

        alert('Curso adicionado com sucesso!');
        document.getElementById('add-course-form').reset();
        fetchCourses();
    } catch (error) {
        console.error('Erro ao adicionar curso:', error);
    }
});

// Buscar e exibir cursos
async function fetchCourses() {
    const coursesContainer = document.getElementById('courses');
    coursesContainer.innerHTML = '';

    try {
        const snapshot = await db.collection('courses').get();
        snapshot.forEach(doc => {
            const course = doc.data();

            const courseCard = `
                <div class="course-card">
                    <img src="${course.image}" alt="${course.title}">
                    <h3>${course.title}</h3>
                    <a href="${course.link}" target="_blank">Acessar curso</a>
                </div>
            `;
            coursesContainer.innerHTML += courseCard;
        });
    } catch (error) {
        console.error('Erro ao buscar cursos:', error);
    }
}

fetchCourses();
