# Quick Start - Sistema de Configuración de Modelos

Guía rápida para usar el sistema de configuración automática de modelos de IA en Edge.AI.

## 🚀 Inicio Rápido

### Primera vez que usas la app:

1. **Abre la aplicación**
2. **Automáticamente verás el asistente de configuración**
3. Sigue los pasos:
   - ✅ Click en "Comenzar configuración"
   - ⏳ Espera mientras detectamos tu hardware
   - 📊 Revisa los modelos recomendados (ordenados por compatibilidad)
   - ✅ Selecciona el modelo que prefieras
   - ⏬ Click en "Cargar modelos seleccionados"
   - ⏳ Espera a que los modelos se descarguen (1-3 min la primera vez)
   - ✅ ¡Listo!

4. **Los modelos se guardan automáticamente**
5. La próxima vez que abras la app, se cargarán automáticamente

---

## 🔄 Reconfigurar Modelos

Si quieres cambiar de modelo después:

1. **Click en "Configurar modelos"** (botón en el sidebar)
2. Verás el menú con opciones:
   - **Cambiar modelos** → Abre el asistente de nuevo para elegir otros
   - **Recargar modelos actuales** → Reinicia los modelos que ya tienes
   - **Resetear configuración** → Borra todo y empieza desde cero

---

## 📋 ¿Qué modelo elegir?

El sistema te muestra un **porcentaje de compatibilidad** para cada modelo:

| Score | Significado | Recomendación |
|-------|-------------|---------------|
| 80-100% ✨ | Excelente | Funcionará muy bien |
| 60-79% ✓ | Bueno | Funcionará bien |
| 40-59% ⚠️ | Usable | Puede ser lento |
| <40% ❌ | No recomendado | Evitar |

### Guía rápida de modelos:

**Para dispositivos potentes** (16GB+ RAM, GPU dedicada):
- Llama 3.2 3B (máxima calidad)
- Phi 3.5 Mini (razonamiento avanzado)

**Para dispositivos normales** (8GB RAM, GPU integrada o sin GPU):
- **Qwen2.5 1.5B** ← Recomendado para la mayoría
- Llama 3.2 1B
- TinyLlama 1.1B

**Para dispositivos básicos** (4GB RAM, sin GPU):
- Qwen2.5 0.5B
- SmolLM2 360M
- SmolLM2 135M (ultra ligero)

---

## 🔧 Solución de Problemas

### El asistente no aparece en primera ejecución

**Solución**: Limpia localStorage y recarga:

```javascript
// En la consola del navegador (F12):
localStorage.removeItem('edge-ai-model-settings');
location.reload();
```

### Modelo tarda mucho en cargar

**Normal la primera vez**: Los modelos se descargan desde internet.

Tiempos aproximados (depende de tu conexión):
- Modelos pequeños (< 500MB): 1-2 minutos
- Modelos medianos (500MB-1.5GB): 2-4 minutos
- Modelos grandes (> 2GB): 4-8 minutos

**La segunda vez es instantáneo** porque se cachea en el navegador.

### Error "Out of memory"

Tu dispositivo no tiene suficiente RAM. **Soluciones**:

1. Cierra otras pestañas del navegador
2. Resetea configuración y elige un modelo más pequeño
3. Reinicia el navegador

### WebGPU no disponible

Si ves que solo se recomienda CPU:

1. Actualiza Chrome/Edge a la última versión
2. Verifica: `chrome://flags/#enable-unsafe-webgpu` debe estar activado
3. Algunos navegadores (Firefox, Safari) no soportan WebGPU aún

---

## 🎯 Filosofía del Sistema

Este sistema está diseñado para ser:

- **Transparente**: Te muestra exactamente por qué se recomienda cada modelo
- **Sin sorpresas**: Porcentajes claros de compatibilidad
- **Técnico pero comprensible**: Explicaciones sin marketing
- **100% local**: Todo en tu navegador, sin enviar datos

---

## 📚 Más Información

Para detalles técnicos completos, consulta: [MODELO_SETUP_DOCS.md](./MODELO_SETUP_DOCS.md)

---

**¿Preguntas?** El sistema está diseñado para ser auto-explicativo, pero si algo no está claro, revisa la documentación técnica completa.
