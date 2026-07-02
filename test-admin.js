import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import usuariosModel from './src/model/usuario.js';

dotenv.config();

async function testAdminSetup() {
    console.log('🔍 Probando configuración de administrador...\n');
    
    try {
        // Conectar a MongoDB
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Conexión a MongoDB exitosa');
        
        // Verificar si existe un usuario administrador
        const adminUser = await usuariosModel.findOne({ tipoUsuario: 'admin' });
        
        if (adminUser) {
            console.log('✅ Usuario administrador encontrado:');
            console.log(`   - Email: ${adminUser.email}`);
            console.log(`   - Nombre: ${adminUser.nombre}`);
            console.log(`   - Tipo: ${adminUser.tipoUsuario}`);
        } else {
            console.log('⚠️  No se encontró usuario administrador');
            console.log('📝 Creando usuario administrador de prueba...');
            
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            const newAdmin = new usuariosModel({
                nombre: 'Administrador',
                email: 'admin@guarderia.com',
                password: hashedPassword,
                tipoUsuario: 'admin',
                animales: [],
                reservas: []
            });
            
            await newAdmin.save();
            console.log('✅ Usuario administrador creado exitosamente');
            console.log('   - Email: admin@guarderia.com');
            console.log('   - Password: admin123');
        }
        
        // Verificar variables de entorno
        console.log('\n📋 Verificando variables de entorno:');
        const requiredVars = ['MONGO_URI', 'PORT', 'JWT', 'FRONTEND_URL'];
        let allPresent = true;
        
        requiredVars.forEach(varName => {
            if (process.env[varName]) {
                console.log(`✅ ${varName}: Configurada`);
            } else {
                console.log(`❌ ${varName}: NO configurada`);
                allPresent = false;
            }
        });
        
        if (allPresent) {
            console.log('\n🎉 ¡Todo está configurado correctamente!');
            console.log('\n📝 Para acceder como administrador:');
            console.log('   1. Ve a http://localhost:5000/api/login/');
            console.log('   2. Usa las credenciales:');
            console.log('      - Email: admin@guarderia.com');
            console.log('      - Password: admin123');
            console.log('   3. Deberías ver el header de administrador');
        } else {
            console.log('\n⚠️  Hay variables de entorno faltantes');
            console.log('   Por favor, configura el archivo .env');
        }
        
    } catch (error) {
        console.error('❌ Error durante la prueba:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

testAdminSetup(); 