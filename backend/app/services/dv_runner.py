"""Service for running data visualization code and capturing matplotlib output."""
import io
import base64
from contextlib import redirect_stdout, redirect_stderr
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

def run_dv_code(code: str) -> tuple[str, str, str]:
    """
    Run data visualization code and capture matplotlib output.
    
    Args:
        code: Python code string that generates matplotlib visualization
        
    Returns:
        tuple of:
        - stdout: captured standard output
        - stderr: captured standard error
        - plot: base64 encoded PNG of the matplotlib plot, or None if no plot
    """
    stdout = io.StringIO()
    stderr = io.StringIO()
    plot_data = None
    
    # Common imports for data visualization
    namespace = {
        'plt': plt,
        'np': np,
        'pd': pd,
        'plt.style.use': plt.style.use,
    }

    try:
        # Capture stdout/stderr while running code
        with redirect_stdout(stdout), redirect_stderr(stderr):
            # Clear any existing plots
            plt.clf()
            
            # Set a nice style
            plt.style.use('bmh')  # Using a built-in style that looks nice
            
            try:
                # Execute the code
                exec(code, namespace)
                print("Code executed successfully")  # Debug output
            except Exception as e:
                stderr.write(f"Code Error: {str(e)}")
                return stdout.getvalue(), stderr.getvalue(), None
            
            # If there are any plots, capture them
            if plt.get_fignums():
                try:
                    buf = io.BytesIO()
                    # Tight layout to prevent cut-off
                    plt.tight_layout()
                    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
                    buf.seek(0)
                    plot_data = base64.b64encode(buf.getvalue()).decode('utf-8')
                    print("Plot captured successfully")  # Debug output
                except Exception as e:
                    stderr.write(f"Plot Save Error: {str(e)}")
                    return stdout.getvalue(), stderr.getvalue(), None
            else:
                print("No plots found")  # Debug output
                stderr.write("Warning: No plot was created. Make sure to call plt.plot() or similar.")
                
            plt.close('all')
    except Exception as e:
        stderr.write(f"Runtime Error: {str(e)}")
        
    return (
        stdout.getvalue(),
        stderr.getvalue(),
        plot_data
    )