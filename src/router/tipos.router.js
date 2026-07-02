import express from "express";
import { crearTipo,listadoTipos, menuCrearTipo } from "../controller/controllerTipo.js";

const router = express.Router();

router.get('/', menuCrearTipo)
router.post('/',crearTipo)
router.get('/listado', listadoTipos)


export default router