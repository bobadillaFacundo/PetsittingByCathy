document.querySelector('.buttonCrearUsuario').addEventListener('click', async () => {

    window.location.href = `/api/login/crearUsuario/`

})


document.getElementById('formCAS').addEventListener('submit', async function (event) {
    event.preventDefault()  // Prevenir el envío convencional del formulario

    // Obtener los datos del formulario
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value

    try {
        // Hacer la solicitud para obtener el token
        const response = await fetch('/api/login/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }, credentials: "include",
            body: JSON.stringify({ username: email, password: password })
        })

        if (!response.ok) {
            const d = await response.json()
            console.error(d.message)
            return
        }

        // Obtener el token de la respuesta
        const { token, idUsuario, tipoUsuario } = await response.json()


        if (localStorage.getItem('token') != null) {
            localStorage.removeItem('token')
        }
        if (localStorage.getItem('email') != null) {
            localStorage.removeItem('email')
        }
        if (localStorage.getItem('tipoUsuario') != null) {
            localStorage.removeItem('tipoUsuario')
        }
        if (localStorage.getItem('idUsuario') != null) {
            localStorage.removeItem('idUsuario')
        }

        localStorage.setItem('token', token)
        localStorage.setItem('email', email)
        localStorage.setItem('tipoUsuario', tipoUsuario)
        localStorage.setItem('idUsuario', idUsuario)
        //definir una cookies - corregido para desarrollo local
        document.cookie = `token=${token}; max-age=3600; path=/; samesite=strict`
        // Redireccionar a la nueva página
        window.location.href = `/api/login/principal/${tipoUsuario}/`

    } catch (err) {
        console.log('Error al realizar la solicitud:', err)
    }
})
