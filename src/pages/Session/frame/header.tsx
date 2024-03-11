import React from 'react';
import {HEADER_HEIGHT} from "@/const";


const Header: React.FC = () => {
  return <div id={"header"}
              style={{backgroundColor: '#D3E3FD', height: HEADER_HEIGHT + "px"}}>
  </div>
};

export default Header;
