import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
import datetime
import os

def create_visuals():
    # Data for the chart
    labels = ['FIFA World Cup', 'Cricket T20', 'Winter Olympics', 'NASCAR', 'Others']
    sizes = [4, 2, 2, 2, 1] # Based on the number of articles in the summary
    colors = ['#ff9999','#66b3ff','#99ff99','#ffcc99', '#c2c2f0']
    
    plt.figure(figsize=(10, 6))
    plt.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%', startangle=140, pctdistance=0.85)
    
    # Draw circle for donut chart
    centre_circle = plt.Circle((0,0),0.70,fc='white')
    fig = plt.gcf()
    fig.gca().add_artist(centre_circle)
    
    plt.axis('equal')  
    plt.title('News Topic Distribution - Feb 6, 2026', fontsize=16)
    plt.tight_layout()
    plt.savefig('news_topic_distribution.png')
    plt.close()

def create_pdf_report():
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    filename = f"Daily_Sports_News_Report_{today}.pdf"
    
    with PdfPages(filename) as pdf:
        # Page 1: Title and Visuals
        fig = plt.figure(figsize=(8.5, 11))
        plt.axis('off')
        
        # Title
        plt.text(0.5, 0.95, 'DAILY SPORTS NEWS BRIEFING', fontsize=24, ha='center', weight='bold', color='#2c3e50')
        plt.text(0.5, 0.91, f'Generated on: {today}', fontsize=12, ha='center', color='#7f8c8d')
        
        # Add the chart
        if os.path.exists('news_topic_distribution.png'):
            img = plt.imread('news_topic_distribution.png')
            # Position: left, bottom, width, height
            newax = fig.add_axes([0.1, 0.5, 0.8, 0.35], anchor='N', zorder=1)
            newax.imshow(img)
            newax.axis('off')
        
        # Summary Text
        text_content = """
HEADLINES (Feb 06, 2026)

⚽ FIFA World Cup 2026
----------------------
• Tickets: Lottery results revealed; sales open for remaining seats.
• Logistics: Platte County residents question public safety budget 
  gaps ($1.2M shortfall) for KCI Airport gateway.
• Planning: Full schedule, dates, and stadium allocations confirmed.
• Facilities: Parking prices and reservation systems launched for all venues.

🏏 Cricket T20 World Cup
-----------------------
• Kickoff: Tournament begins Feb 7 in India & Sri Lanka.
• Teams: USA team confirmed for participation; refugee players spotlighted.
• Guide: Full format, groups, and venue guide published by ICC.

❄️ Winter Olympics 2026
-----------------------
• Ice Hockey: Competition schedule and rules finalized.
• Star Power: Eileen Gu's commercial dominance ($23M/yr) highlighted 
  ahead of the games.

🏁 Other Sports
--------------
• NASCAR: 2026 Schedule released; new TV rights with TNT/DirectTV.
• Darts: Premier League Night 1 draw and predictions live.
"""
        plt.text(0.1, 0.05, text_content, fontsize=11, family='monospace', verticalalignment='bottom')
        
        pdf.savefig()
        plt.close()
    
    return filename

if __name__ == "__main__":
    print("Generating visuals...")
    create_visuals()
    print("Generating PDF report...")
    pdf_file = create_pdf_report()
    print(f"REPORT_GENERATED: {pdf_file}")
