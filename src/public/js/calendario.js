document.addEventListener('DOMContentLoaded', async function () {
    const calendarEl = document.getElementById('calendar');
    const reservaModal = document.getElementById('reservaModal');
    const guardarReservaBtn = document.getElementById('guardarReserva');
    const cerrarModalBtn = document.getElementById('cerrarModal');
    let selectedInfo = null;
    let modalAbierto = false;

    // Función para cerrar el modal
    function cerrarModal() {
        reservaModal.style.display = 'none';
        modalAbierto = false;
        // Limpiar campos del formulario
        if (document.getElementById('tipoReserva')) {
            document.getElementById('tipoReserva').value = '';
        }
        if (document.getElementById('alimento')) {
            document.getElementById('alimento').value = '';
        }
        if (document.getElementById('medicamentos')) {
            document.getElementById('medicamentos').value = '';
        }
        if (document.getElementById('extras')) {
            document.getElementById('extras').value = '';
        }
        // Limpiar la selección del calendario
        if (selectedInfo) {
            selectedInfo = null;
        }
    }

    // Crear el fondo oscuro (overlay)
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '9998';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);

    // Crear el menú de eventos
    const menuEvento = document.createElement('div');
    menuEvento.id = 'menuEvento';
    Object.assign(menuEvento.style, {
        position: 'absolute',
        top: '-9999px',  // Inicialmente fuera de la pantalla
        left: '-9999px', // Evita que aparezca en (0,0)
        display: 'none',
        background: '#ffffff',
        border: '1px solid #ddd',
        padding: '12px',
        boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.15)',
        zIndex: '10000',
        pointerEvents: 'auto',
        borderRadius: '8px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#333',
        minWidth: '200px',
        opacity: '0',
        transform: 'scale(0.95)',
        transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out'
    });

    document.body.appendChild(menuEvento);

    // Función para mostrar el menú en la posición del clic
    function mostrarMenu(x, y) {
        menuEvento.style.left = `${x}px`;
        menuEvento.style.top = `${y}px`;
        menuEvento.style.display = 'block'; // Se hace visible
        requestAnimationFrame(() => {
            menuEvento.style.opacity = '1';
            menuEvento.style.transform = 'scale(1)';
        });
    }

    // Función para ocultar el menú con animación
    function ocultarMenu() {
        menuEvento.style.opacity = '0';
        menuEvento.style.transform = 'scale(0.95)';
        setTimeout(() => {
            menuEvento.style.display = 'none';
            menuEvento.style.top = '-9999px';  // Lo volvemos a ocultar fuera de la pantalla
            menuEvento.style.left = '-9999px';
        }, 200);
    }

    function calcularDiferenciaDias(fecha1, fecha2) {
        const date1 = new Date(fecha1);
        const date2 = new Date(fecha2);

        // Calcula la diferencia en milisegundos
        const diferenciaTiempo = Math.abs(date2 - date1);

        // Convierte la diferencia a días
        return Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24));
    }

    // Función para cerrar el menú
    function cerrarMenu() {
        menuEvento.style.display = 'none';
        overlay.style.display = 'none';
        location.reload();
    }

    // Cargar reservas
    const fetchReservas = async () => {
        const id = localStorage.getItem('idUsuario');
        const tipo = localStorage.getItem('tipoUsuario');
        const res = await fetch(`/api/reservas/reservas/${id}/${tipo}/`);
        return await res.json();
    };

    // Inicializar FullCalendar
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        selectable: true,
        editable: false,
        contentHeight: 500,
        locale: 'es',
        timeZone: 'UTC',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth'
        },
        aspectRatio: 1.35,
        height: 'auto',
        select: function (info) {
            if (modalAbierto) return;
            selectedInfo = info;
            
            // Verificar si hay mascotas disponibles
            const tipoReservaSelect = document.getElementById('tipoReserva');
            if (tipoReservaSelect && tipoReservaSelect.options.length <= 1) {
                // No hay mascotas, mostrar mensaje
                reservaModal.style.display = 'block';
                modalAbierto = true;
            } else {
                // Hay mascotas, mostrar modal normal
                reservaModal.style.display = 'block';
                modalAbierto = true;
            }
            calendar.unselect();
        },
        eventClick: function (info) {
            info.jsEvent.preventDefault();
            info.jsEvent.stopPropagation();

            menuEvento.innerHTML = '';  // Limpia el menú antes de agregar botones nuevos

            // Botón Eliminar
            const eliminarBtn = document.createElement('button');
            eliminarBtn.textContent = 'Eliminar';
            eliminarBtn.className = 'btn btn-danger btn-sm me-2';
            eliminarBtn.onclick = async function () {
                if(!info.event.extendedProps.isPagada){
                    if (confirm(`¿Eliminar la reserva de "${info.event.title}"?`)) {
                        const id = info.event.id
                        const res = await fetch(`/api/reservas/${id}`, { method: 'DELETE' });
                        if (res.ok) {
                            info.event.remove();
                            location.reload();
                        } else {
                            alert("Error al eliminar la reserva.");
                        }
                    }
                } else {
                    alert("Error, no se puede eliminar la reserva porque ya ha sido pagada.");
                }
            }

            // Botón Detalle
            const detalleBtn = document.createElement('button');
            detalleBtn.textContent = 'Detalle';
            detalleBtn.className = 'btn btn-info btn-sm me-2';
            detalleBtn.onclick = function () {
                alert(`Detalles de la reserva: ${info.event.title} 
                      Fecha de inicio: ${info.event.start} 
                      Fecha de fin: ${info.event.end}
                      Alimento: ${info.event.extendedProps.alimento}
                      Medicamento: ${info.event.extendedProps.medicamento}
                      Monto Total: ${info.event.extendedProps.montoTotal}
                      Extra: ${info.event.extendedProps.extra}
                      Esta Pagada: ${info.event.extendedProps.isPagada}`)
            
                location.reload()
            };

            // Botón Pagar
            const pagarBtn = document.createElement('button');
            pagarBtn.textContent = 'Pagar';
            pagarBtn.className = 'btn btn-success btn-sm';
            pagarBtn.onclick = function () {
                const tipo = localStorage.getItem('tipoUsuario');
                const reserva = info.event.id
                window.location.href = `/api/reservas/pagar/${tipo}/${reserva}`;
            };

            // Agregar botones al menú
            menuEvento.appendChild(eliminarBtn);
            menuEvento.appendChild(detalleBtn);
            menuEvento.appendChild(pagarBtn);

            // Posicionar y mostrar menú
            menuEvento.style.left = `${info.jsEvent.clientX + window.scrollX}px`;
            menuEvento.style.top = `${info.jsEvent.clientY + window.scrollY}px`;
            menuEvento.style.display = 'block';

            // Mostrar overlay
            overlay.style.display = 'block';
        }
    });

    // Cargar eventos
    const storedEvents = await fetchReservas();
    storedEvents.reservas.forEach(reserva => {
        calendar.addEvent({
            id: reserva._id,
            title: `Reserva: ${reserva.id_usuario.nombre}`,
            start: reserva.fecha_desde,
            end: reserva.fecha_hasta,
            allDay: true,
            extendedProps : {
                alimento: reserva.alimento,
                medicamento: reserva.medicamento,    
                extra: reserva.extras,
                montoTotal: reserva.montoTotal,
                isPagada: reserva.isPagada  
            }
        });
    });

    calendar.render();

    // Event listeners para el modal
    if (cerrarModalBtn) {
        cerrarModalBtn.addEventListener('click', cerrarModal);
    }

    if (guardarReservaBtn) {
        guardarReservaBtn.addEventListener('click', async function() {
            const tipoReserva = document.getElementById('tipoReserva').value;
            const alimento = document.getElementById('alimento').value;
            const medicamentos = document.getElementById('medicamentos').value;
            const extras = document.getElementById('extras').value;

            if (!tipoReserva) {
                alert('Por favor selecciona una mascota');
                return;
            }

            if (!selectedInfo) {
                alert('Error: No se ha seleccionado una fecha');
                return;
            }

            const fechaDesde = selectedInfo.startStr;
            const fechaHasta = selectedInfo.endStr;
            const dias = calcularDiferenciaDias(fechaDesde, fechaHasta);

            const reservaData = {
                id_animal: tipoReserva,
                fecha_desde: fechaDesde,
                fecha_hasta: fechaHasta,
                alimento: alimento,
                medicamento: medicamentos,
                extras: extras,
                dias: dias
            };

            try {
                const response = await fetch('/api/reservas', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(reservaData)
                });

                if (response.ok) {
                    alert('Reserva creada exitosamente');
                    cerrarModal();
                    location.reload();
                } else {
                    const errorData = await response.json();
                    alert(`Error al crear la reserva: ${errorData.message || 'Error desconocido'}`);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error al crear la reserva');
            }
        });
    }

    // Cerrar modal al hacer clic fuera de él
    reservaModal.addEventListener('click', function(e) {
        if (e.target === reservaModal) {
            cerrarModal();
        }
    });

    // Cerrar menú al hacer clic fuera de él
    document.addEventListener('click', function(e) {
        if (!menuEvento.contains(e.target) && !e.target.closest('.fc-event')) {
            ocultarMenu();
            overlay.style.display = 'none';
        }
    });

    // Cerrar menú y modal con Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ocultarMenu();
            overlay.style.display = 'none';
            if (modalAbierto) {
                cerrarModal();
            }
        }
    });
});
