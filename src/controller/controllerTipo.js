import tipoAnimalModel from '../model/tipoAnimal.js'


export const crearTipo = ('/', async (req, res) => {
    try {
        let {tipo} = req.body
        const nuevoTipo = new tipoAnimalModel({
            tipo:tipo,animales:[]
        })
        const tipoGuardado = await nuevoTipo.save()
        res.status(201).json(tipoGuardado)
    } catch (error) {
        res.status(400).json({ error: error.message })
    }
})

export const menuCrearTipo = ('/', async (req, res) => {
    try {
        return res.render('crearTipo',{tipoUsuario: req.tipoUsuario} )
    } catch (error) {
        console.log(error)
    }
})


export const listadoTipos = ('/', async (req, res) => {  
    try {
        const tipos = await tipoAnimalModel.find()
        res.render('listadoTipos', {tiposAnimales: tipos, tipoUsuario: req.tipoUsuario })
    } catch (error) {
        console.log(error)  
        res.status(400).json({ error: error.message })   
    }
    }   
)