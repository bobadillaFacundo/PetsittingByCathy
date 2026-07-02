import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import usuariosModel from "../model/usuario.js"
dotenv.config()

const authMiddleware = async (req, res, next) => {    
    const token = req.cookies['token']
    
    if (!token) {
        //return res.status(401).json({ message: 'Acceso denegado. Token no proporcionado.' })
        return res.redirect('/api/login')
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT)  // Verifica el token
        const user = await usuariosModel.findById(decoded.id)
        
        if (!user) {
            return res.redirect('/api/login')
        }
        
        req.user = decoded // Agrega los datos del usuario al request
        req.tipoUsuario = user.tipoUsuario // Agrega el tipo de usuario al request
        next() // Continúa con la siguiente función en la ruta
    } catch (error) {
        return res.redirect('/api/login')
        //return res.status(403).json({ message: 'Token inválido o expirado.' })
    }
}

// Middleware para verificar si el usuario es administrador
const adminMiddleware = async (req, res, next) => {
    const token = req.cookies['token']
    
    if (!token) {
        return res.redirect('/api/login')
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT)
        const user = await usuariosModel.findById(decoded.id)
        
        if (!user || user.tipoUsuario !== 'admin') {
            return res.status(403).json({ message: 'Acceso denegado. Se requieren permisos de administrador.' })
        }
        
        req.user = decoded
        req.tipoUsuario = user.tipoUsuario
        next()
    } catch (error) {
        return res.redirect('/api/login')
    }
}

export { authMiddleware as default, adminMiddleware }