import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

console.log('🔍 Verificando configuración del proyecto...\n');

const requiredEnvVars = [
    'MONGO_URI',
    'PORT', 
    'JWT',
    'FRONTEND_URL'
];

const optionalEnvVars = [
    'CLIENT_ID',
    'CLIENT_SECRET', 
    'ACCESS_TOKEN',
    'DATA_CENTER',
    'SUPABASE_KEY',
    'SUPABSE_URL'
];

console.log('📋 Variables de entorno requeridas:');
let allRequiredPresent = true;

requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    if (value && value.trim() !== '') {
        console.log(`✅ ${varName}: Configurada`);
    } else {
        console.log(`❌ ${varName}: NO configurada`);
        allRequiredPresent = false;
    }
});

console.log('\n📋 Variables de entorno opcionales:');
optionalEnvVars.forEach(varName => {
    const value = process.env[varName];
    if (value && value.trim() !== '') {
        console.log(`✅ ${varName}: Configurada`);
    } else {
        console.log(`⚠️  ${varName}: NO configurada (opcional)`);
    }
});

console.log('\n📁 Verificando archivos importantes:');
const importantFiles = [
    '.env',
    'src/app.js',
    'src/middlewares/authMiddleware.js',
    'src/public/js/login.js'
];

importantFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file}: Existe`);
    } else {
        console.log(`❌ ${file}: NO existe`);
    }
});

if (allRequiredPresent) {
    console.log('\n🎉 ¡Configuración correcta! Puedes iniciar el servidor.');
} else {
    console.log('\n⚠️  Hay variables de entorno faltantes. Por favor, configura el archivo .env');
    console.log('\n📝 Ejemplo de archivo .env:');
    console.log('MONGO_URI=mongodb://localhost:27017/guarderiaCanina');
    console.log('PORT=5000');
    console.log('JWT=tu_clave_secreta_jwt_aqui');
    console.log('FRONTEND_URL=http://localhost:5000');
} 