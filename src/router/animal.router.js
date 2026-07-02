import express from "express";
import { registrarMascota, todosLosAnimales, busquedaAnimal, menuCrearAnimal,todasLasMascotasAdopcion } from "../controller/controllerAnimal.js";

const router = express.Router();


router.get('/', todosLosAnimales)
router.get('/altaAnimal', menuCrearAnimal)
router.get('/adopcionAnimal', todasLasMascotasAdopcion)
router.post('/registrarMascota', registrarMascota)
router.route('/busqueda/:nombreAnimal').get(busquedaAnimal)

export default router