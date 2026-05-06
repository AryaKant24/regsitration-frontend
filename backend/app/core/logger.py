import logging
import sys

# Define ANSI color codes for terminal output
class LogColors:
    RESET = "\033[0m"
    INFO = "\033[92m"       # Green
    WARNING = "\033[93m"    # Yellow
    ERROR = "\033[91m"      # Red
    DEBUG = "\033[94m"      # Blue

class ProfessionalFormatter(logging.Formatter):
    """Custom structured formatter for clean, professional terminal output."""
    
    FORMATS = {
        logging.DEBUG: f"{LogColors.DEBUG}[DEBUG]    | %(asctime)s | %(message)s{LogColors.RESET}",
        logging.INFO: f"{LogColors.INFO}[INFO]     | %(asctime)s | %(message)s{LogColors.RESET}",
        logging.WARNING: f"{LogColors.WARNING}[WARNING]  | %(asctime)s | %(message)s{LogColors.RESET}",
        logging.ERROR: f"{LogColors.ERROR}[ERROR]    | %(asctime)s | %(message)s{LogColors.RESET}",
        logging.CRITICAL: f"{LogColors.ERROR}[CRITICAL] | %(asctime)s | %(message)s{LogColors.RESET}",
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt, datefmt="%H:%M:%S")
        return formatter.format(record)

def setup_logging():
    """Configures the root logger with the professional formatter."""
    # Remove all default handlers
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)
        
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(ProfessionalFormatter())
    
    logging.root.setLevel(logging.INFO)
    logging.root.addHandler(handler)
    
    # Silence noisy default uvicorn/fastapi logs if desired
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
